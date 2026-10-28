"""Import integration tests. Requires an explicitly selected local MongoDB.

Run with MEDCRM_IMPORT_TEST_MONGO_URL=mongodb://127.0.0.1:27184/
Every test uses and drops its own UUID-named database; no product config loads.
"""
import asyncio
from copy import deepcopy
import importlib.util
from io import BytesIO
import os
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch
from urllib.parse import urlparse
import uuid
from xml.sax.saxutils import escape
from zipfile import ZipFile

import httpx
from fastapi import FastAPI
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from services.price_import_service import PriceImportService
from services.laboratory_service import LaboratoryService


def xlsx(rows):
    output = BytesIO()
    sheet = []
    for number, row in enumerate(rows, 1):
        cells = []
        for index, value in enumerate(row):
            ref = f'{chr(65 + index)}{number}'
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{ref}"><v>{value}</v></c>')
            elif value is not None:
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value))}</t></is></c>')
        sheet.append(f'<row r="{number}">{"".join(cells)}</row>')
    with ZipFile(output, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        archive.writestr('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Prices" sheetId="1" r:id="rId1"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>')
        archive.writestr('xl/worksheets/sheet1.xml', '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(sheet) + '</sheetData></worksheet>')
    return output.getvalue()


def load_router(name, filename):
    spec = importlib.util.spec_from_file_location(name, BACKEND / 'routers' / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@unittest.skipUnless(os.environ.get('MEDCRM_IMPORT_TEST_MONGO_URL'), 'Explicit local test MongoDB required')
class PriceImportIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['MEDCRM_IMPORT_TEST_MONGO_URL']
        if urlparse(url).hostname not in ('127.0.0.1', 'localhost'):
            raise RuntimeError('These tests refuse non-local MongoDB servers')
        self.mongo = AsyncIOMotorClient(url, serverSelectionTimeoutMS=3000)
        await self.mongo.admin.command('ping')
        self.db = self.mongo['medcrm_price_import_test_' + uuid.uuid4().hex]
        self.service = PriceImportService(self.db)
        async def actor():
            return types.SimpleNamespace(id='test-admin', full_name='Synthetic admin')
        auth = types.ModuleType('routers.auth')
        auth.get_current_active_user = actor
        auth.require_role = lambda roles: actor
        database = types.ModuleType('database')
        database.db = self.db
        with patch.dict(sys.modules, {'database': database, 'routers.auth': auth}):
            self.router = load_router('isolated_price_import', 'price_import.py')
            self.lab_router = load_router('isolated_lab_import', 'laboratories.py')
        self.app = FastAPI()
        self.app.include_router(self.router.price_import_router, prefix='/api')
        self.app.include_router(self.lab_router.laboratories_router)
        self.app.dependency_overrides[self.router.get_import_service] = lambda: self.service
        self.app.dependency_overrides[self.lab_router.get_import_service] = lambda: self.service
        self.app.dependency_overrides[self.lab_router.get_laboratory_service] = lambda: LaboratoryService(self.db)
        self.http = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app, raise_app_exceptions=False), base_url='http://isolated')

    async def asyncTearDown(self):
        await self.http.aclose()
        assert self.db.name.startswith('medcrm_price_import_test_')
        await self.mongo.drop_database(self.db.name)
        self.mongo.close()

    async def send(self, rows, *, preview=False, query='', filename='prices.xlsx', path=None):
        content = rows if isinstance(rows, bytes) else xlsx(rows)
        endpoint = path or ('/api/price-import/preview' if preview else '/api/price-import/upload')
        return await self.http.post(endpoint + query, files={'file': (filename, content, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})

    async def history(self):
        response = await self.http.get('/api/price-import/history')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    async def test_b12_skip_update_preserve_other_services_and_patient_prices(self):
        self.assertEqual(await self.history(), {'last_import': None, 'last_successful_import': None})
        await self.db.service_prices.insert_one({'id':'unrelated','service_name':'Not in file','category':'Other','price':777,'is_active':True})
        invoice = {'id':'synthetic-plan','services':[{'service_id':'historical-service','unit_price':100,'total_price':100}], 'total_cost':100}
        await self.db.treatment_plans.insert_one(deepcopy(invoice))
        before_invoice = await self.db.treatment_plans.find_one({'id':invoice['id']})
        rows = [['Название','Цена','Специальность'], ['Витамин В12',100,'Медикаменты'], ['Витамин В12',5100,'Олимп']]
        preview = (await self.send(rows, preview=True)).json()
        self.assertEqual(preview['services_preview']['new_count'],2)
        self.assertTrue(preview['can_import'])
        self.assertIsNone((await self.history())['last_import'])
        result = (await self.send(rows)).json()
        self.assertEqual(result['status'],'success')
        self.assertEqual(result['services']['created'],2)
        success = (await self.history())['last_successful_import']
        self.assertTrue(success['finished_at'].endswith('Z'))
        original = {r['category']:r for r in await self.db.service_prices.find({'service_name':'Витамин В12'}).to_list(None)}
        self.assertEqual({k:v['price'] for k,v in original.items()}, {'Медикаменты':100, 'Олимп':5100})
        await self.db.treatment_plans.update_one({'id':invoice['id']}, {'$set': {
            'services':[{'service_id':original['Медикаменты']['id'], 'unit_price':100, 'total_price':100}]
        }})
        before_invoice = await self.db.treatment_plans.find_one({'id':invoice['id']})
        repeated = (await self.send(rows)).json()
        self.assertEqual(repeated['services']['skipped'],2)
        changed = [['Название','Цена','Специальность'], ['Витамин В12',120,'Медикаменты'], ['Витамин В12',5300,'Олимп']]
        updated = (await self.send(changed, query='?update_existing=true')).json()
        self.assertEqual(updated['services']['updated'],2)
        final = {r['category']:r for r in await self.db.service_prices.find({'service_name':'Витамин В12'}).to_list(None)}
        self.assertEqual({k:v['price'] for k,v in final.items()}, {'Медикаменты':120, 'Олимп':5300})
        self.assertEqual({k:v['id'] for k,v in final.items()}, {k:v['id'] for k,v in original.items()})
        self.assertEqual(await self.db.service_prices.count_documents({}),3)
        self.assertEqual((await self.db.service_prices.find_one({'id':'unrelated'}))['price'],777)
        self.assertEqual(await self.db.treatment_plans.find_one({'id':invoice['id']}),before_invoice)
        reopened = await PriceImportService(self.db).get_import_history()
        self.assertEqual(reopened['last_successful_import']['status'],'success')

    async def test_format_empty_and_zero_valid_rows_never_advance_success_time(self):
        good = [['Название','Цена'], ['Initial',10]]
        await self.send(good)
        successful = (await self.history())['last_successful_import']
        invalid_files = [
            [['Report'],['Explanation'],[],[],['Название','Цена'],['Service',100]],
            [['Название','Цена, ₸'],['Service',100]],
            [['Название','Цена']],
            [['Название','Цена'],['Service','invalid']],
            b'',
        ]
        for rows in invalid_files:
            response = await self.send(rows)
            self.assertEqual(response.status_code,400,response.text)
            history = await self.history()
            self.assertEqual(history['last_import']['status'],'failed')
            self.assertEqual(history['last_successful_import'],successful)
        response = await self.send([['Название','Цена, ₸'],['Service',100]],preview=True)
        self.assertFalse(response.json()['can_import'])
        self.assertIn('Не найден столбец с ценой',response.json()['parse_errors'])
        self.assertEqual((await self.history())['last_successful_import'],successful)
        self.assertEqual((await self.send(b'anything',filename='prices.csv')).status_code,400)

    async def test_partial_parse_and_import_errors_have_separate_history(self):
        await self.send([['Название','Цена'],['Existing',10]])
        successful = (await self.history())['last_successful_import']
        rows = [['Название','Цена'],['New valid',20],['Invalid','not a price']]
        preview = (await self.send(rows,preview=True)).json()
        self.assertTrue(preview['can_import'])
        self.assertEqual(preview['status'],'partial')
        self.assertTrue(preview['parse_errors'])
        result = (await self.send(rows)).json()
        self.assertEqual(result['status'],'partial')
        self.assertFalse(result['success'])
        history = await self.history()
        self.assertEqual(history['last_import']['status'],'partial')
        self.assertEqual(history['last_successful_import'],successful)
        response = await self.send([['Название','Цена'],['Existing',30],['Another new',40]],query='?skip_duplicates=false')
        self.assertEqual(response.json()['status'],'partial')
        self.assertTrue(response.json()['errors']['import'])
        failed = await self.send([['Название','Цена'],['Existing',30]],query='?skip_duplicates=false')
        self.assertEqual(failed.json()['status'],'failed')
        self.assertEqual((await self.history())['last_successful_import'],successful)

    async def test_unexpected_failure_does_not_become_success(self):
        with patch.object(self.service,'ensure_categories_exist',AsyncMock(side_effect=RuntimeError('synthetic write failure'))):
            response = await self.send([['Название','Цена'],['Service',10]])
        self.assertEqual(response.status_code,500)
        history = await self.history()
        self.assertIsNone(history['last_successful_import'])
        self.assertEqual(history['last_import']['status'],'failed')

    async def test_laboratory_and_general_imports_never_overwrite_each_other(self):
        for lab_id in ('lab-a','lab-b'):
            await self.db.laboratories.insert_one({'id':lab_id,'name':'Олимп','is_active':True})
        rows = [['Название','Цена','Специальность'],['Витамин В12',5100,'Олимп']]
        for lab_id in ('lab-a','lab-b'):
            result = await self.send(rows,path=f'/api/laboratories/{lab_id}/import-price')
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json()['parsed']['created'],1)
            self.assertEqual((await self.history())['last_successful_import']['laboratory_id'],lab_id)
        await self.db.service_prices.insert_one({'id':'legacy-lab','service_name':'Витамин В12','category':'Олимп','laboratory_name':'Legacy laboratory','price':6000,'is_active':True})
        result = (await self.send(rows)).json()
        self.assertEqual(result['services']['created'],1)
        changed = [['Название','Цена','Специальность'],['Витамин В12',5200,'Олимп']]
        result = (await self.send(changed,query='?update_existing=true')).json()
        self.assertEqual(result['services']['updated'],1)
        stored = await self.db.service_prices.find({}).to_list(None)
        self.assertEqual(len(stored),4)
        for row in stored:
            if row.get('laboratory_id'):
                self.assertEqual(row['price'],5100)
            elif row.get('laboratory_name'):
                self.assertEqual(row['price'],6000)
            else:
                self.assertEqual(row['price'],5200)

    async def test_inactive_rows_and_file_duplicates_use_the_same_identity(self):
        rows = [['Название','Цена','Специальность','Статус'], ['Витамин В12',100,'Медикаменты','Недоступен'], ['Витамин В12',5100,'Олимп','Доступен']]
        await self.send(rows)
        repeated = (await self.send(rows,query='?update_existing=true')).json()
        self.assertEqual(repeated['services']['updated'],2)
        self.assertEqual(await self.db.service_prices.count_documents({}),2)
        preview = (await self.send([['Название','Цена'],['Same',10],['Same',20]],preview=True)).json()
        self.assertEqual(preview['services_preview']['new_count'],1)
        self.assertEqual(preview['services_preview']['duplicate_count'],1)

    async def test_ambiguous_legacy_matches_are_reported_without_arbitrary_update(self):
        for number in (1,2):
            await self.db.service_prices.insert_one({'id':f'old-{number}','service_name':'Ambiguous','price':number,'is_active':True})
        rows = [['Название','Цена'],['Ambiguous',999]]
        preview = (await self.send(rows,preview=True)).json()
        self.assertFalse(preview['can_import'])
        self.assertTrue(preview['services_preview']['match_errors'])
        result = (await self.send(rows,query='?update_existing=true')).json()
        self.assertEqual(result['status'],'failed')
        self.assertEqual(result['services']['updated'],0)
        self.assertEqual(sorted(r['price'] for r in await self.db.service_prices.find({}).to_list(None)),[1,2])


if __name__ == '__main__':
    unittest.main()
