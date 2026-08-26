"""
Price Import Service - business logic for importing service prices from Excel files
Supports .xls and .xlsx formats
"""
import pandas as pd
import re
import uuid
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from motor.motor_asyncio import AsyncIOMotorDatabase
from io import BytesIO

from models.services import ServicePrice, ServiceCategory


class PriceImportService:
    """Service for importing service prices from Excel files"""
    
    # Mapping of Excel columns to model fields
    COLUMN_MAPPING = {
        'название': 'service_name',
        'name': 'service_name',
        'наименование': 'service_name',
        'услуга': 'service_name',
        'специальность': 'category',
        'category': 'category',
        'категория услуги': 'category',
        'цена': 'price',
        'price': 'price',
        'стоимость': 'price',
        'код': 'service_code',
        'code': 'service_code',
        'скидка': 'discount_flag',
        'начисление': 'payment_type',
        'оплата': 'payment_type',
        'статус': 'status',
        'описание': 'description',
        'единица': 'unit',
        'unit': 'unit',
    }
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
    
    def _clean_price(self, price_value: Any) -> Optional[float]:
        """Clean price value from string format (e.g., '11 500₸' -> 11500.0)"""
        if price_value is None or pd.isna(price_value):
            return None
        if isinstance(price_value, (int, float)):
            return float(price_value)
        price_str = str(price_value)
        price_str = re.sub(r'[₸тгтенгерубр$€\s]', '', price_str, flags=re.IGNORECASE)
        price_str = price_str.replace(',', '.')
        price_str = re.sub(r'[^\d.]', '', price_str)
        try:
            return float(price_str) if price_str else None
        except ValueError:
            return None
    
    def _parse_discount_flag(self, value: Any) -> bool:
        """Parse discount flag - returns True if discount is DISABLED"""
        if value is None or pd.isna(value):
            return False
        value_str = str(value).lower().strip()
        if 'запрещ' in value_str or 'нет' in value_str:
            return True
        return False
    
    def _parse_status(self, value: Any) -> bool:
        """Parse status - returns True if service is active"""
        if value is None or pd.isna(value):
            return True
        value_str = str(value).lower().strip()
        if 'недоступ' in value_str or 'неактив' in value_str:
            return False
        return True
    
    def _map_columns(self, df: pd.DataFrame) -> Dict[str, str]:
        """Map DataFrame columns to model fields"""
        column_map = {}
        for col in df.columns:
            normalized = col.lower().strip()
            if normalized in self.COLUMN_MAPPING:
                column_map[col] = self.COLUMN_MAPPING[normalized]
        return column_map
    
    def _get_col(self, column_map: Dict, field: str):
        """Get column name for a field"""
        for k, v in column_map.items():
            if v == field:
                return k
        return None
    
    def parse_excel(self, file_content: bytes, filename: str) -> Tuple[List[Dict], List[str], List[str]]:
        """Parse Excel file and return (services_list, categories_list, errors_list)"""
        errors = []
        services = []
        categories_set = set()
        
        try:
            df = None
            # Try reading as Excel first
            try:
                engine = 'xlrd' if filename.endswith('.xls') else 'openpyxl'
                df = pd.read_excel(BytesIO(file_content), engine=engine)
            except Exception as excel_err:
                # If Excel fails, try reading as HTML (common for web exports)
                try:
                    dfs = pd.read_html(BytesIO(file_content))
                    if dfs:
                        df = dfs[0]
                        # Remove unnamed columns
                        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
                except Exception as html_err:
                    errors.append(f"Не удалось прочитать файл ни как Excel ({str(excel_err)}), ни как HTML ({str(html_err)})")
                    return [], [], errors
            
            if df is None or df.empty:
                errors.append("Файл пустой или не содержит данных")
                return [], [], errors
            
            column_map = self._map_columns(df)
            
            name_col = self._get_col(column_map, 'service_name')
            price_col = self._get_col(column_map, 'price')
            
            if not name_col:
                errors.append("Не найден столбец с названием услуги")
                return [], [], errors
            if not price_col:
                errors.append("Не найден столбец с ценой")
                return [], [], errors
            
            cat_col = self._get_col(column_map, 'category')
            code_col = self._get_col(column_map, 'service_code')
            disc_col = self._get_col(column_map, 'discount_flag')
            pay_col = self._get_col(column_map, 'payment_type')
            stat_col = self._get_col(column_map, 'status')
            desc_col = self._get_col(column_map, 'description')
            unit_col = self._get_col(column_map, 'unit')
            
            for idx, row in df.iterrows():
                try:
                    service_name = row.get(name_col)
                    if pd.isna(service_name) or not str(service_name).strip():
                        continue
                    
                    service_name = str(service_name).strip()
                    price = self._clean_price(row.get(price_col))
                    
                    if price is None or price < 0:
                        errors.append(f"Строка {idx + 2}: Некорректная цена для '{service_name}'")
                        continue
                    
                    svc = {
                        'id': str(uuid.uuid4()),
                        'service_name': service_name,
                        'price': price,
                        'is_active': True,
                        'created_at': datetime.utcnow(),
                        'updated_at': datetime.utcnow(),
                    }
                    
                    if cat_col and not pd.isna(row.get(cat_col)):
                        cat = str(row.get(cat_col)).strip()
                        if cat and cat != '-':
                            svc['category'] = cat
                            categories_set.add(cat)
                    
                    if code_col and not pd.isna(row.get(code_col)):
                        code = str(row.get(code_col)).strip()
                        if code and code != '-':
                            svc['service_code'] = code
                    
                    if disc_col:
                        svc['disable_discount'] = self._parse_discount_flag(row.get(disc_col))
                    
                    if pay_col and not pd.isna(row.get(pay_col)):
                        pay = str(row.get(pay_col)).strip()
                        if pay and pay != '-':
                            svc['payment_type'] = pay
                    
                    if stat_col:
                        svc['is_active'] = self._parse_status(row.get(stat_col))
                    
                    if desc_col and not pd.isna(row.get(desc_col)):
                        desc = str(row.get(desc_col)).strip()
                        if desc and desc != '-':
                            svc['description'] = desc
                    
                    if unit_col and not pd.isna(row.get(unit_col)):
                        unit = str(row.get(unit_col)).strip()
                        if unit and unit != '-':
                            svc['unit'] = unit
                    
                    services.append(svc)
                except Exception as e:
                    errors.append(f"Строка {idx + 2}: {str(e)}")
        except Exception as e:
            errors.append(f"Ошибка чтения файла: {str(e)}")
        
        return services, list(categories_set), errors
    
    async def ensure_categories_exist(self, categories: List[str]) -> Dict[str, int]:
        """Ensure all categories exist in service_categories. Creates missing ones."""
        created = 0
        existing = 0
        
        for category_name in categories:
            if not category_name:
                continue
            exists = await self.db.service_categories.find_one({
                "name": category_name, "is_active": True
            })
            if exists:
                existing += 1
            else:
                category = ServiceCategory(
                    name=category_name,
                    description="Импортировано из прайса",
                    is_active=True
                )
                await self.db.service_categories.insert_one(category.dict())
                created += 1
        
        return {'created': created, 'existing': existing}
    
    async def import_services(
        self, 
        services: List[Dict], 
        update_existing: bool = False,
        skip_duplicates: bool = True
    ) -> Dict[str, Any]:
        """Import services to database"""
        created = 0
        updated = 0
        skipped = 0
        errors = []
        
        for svc in services:
            try:
                service_name = svc['service_name']
                existing = await self.db.service_prices.find_one({
                    "service_name": service_name, "is_active": True
                })
                
                if existing:
                    if update_existing:
                        svc['updated_at'] = datetime.utcnow()
                        svc.pop('id', None)
                        svc.pop('created_at', None)
                        await self.db.service_prices.update_one(
                            {"id": existing['id']}, {"$set": svc}
                        )
                        updated += 1
                    elif skip_duplicates:
                        skipped += 1
                    else:
                        errors.append(f"Услуга '{service_name}' уже существует")
                else:
                    await self.db.service_prices.insert_one(svc)
                    created += 1
            except Exception as e:
                errors.append(f"Ошибка: {svc.get('service_name', '?')}: {str(e)}")
        
        return {
            'created': created, 'updated': updated, 'skipped': skipped,
            'errors': errors, 'total_processed': created + updated + skipped
        }
