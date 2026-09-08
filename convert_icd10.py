# -*- coding: utf-8 -*-
"""Конвертация официального справочника МКБ-10 (Минздрав РФ, CSV) в формат {code, name} JSON
для поиска в консультационном листе."""
import csv
import json
import os
import re
import shutil

SRC = os.path.join(os.environ['TEMP'], 'mkb10_src', 'resources', '1.2.643.5.1.13.13.11.1005_2.27.csv')
DST = os.path.join('E:', os.sep, 'new-med-crm', 'backend', 'data', 'icd10_codes.json')

# Код диагноза вида: A00, A00.0, A00.01, K02.1 и т.п. (не классы/блоки/диапазоны)
CODE_RE = re.compile(r'^[A-Z]\d{2}(\.\d+)?$')

codes = {}
with open(SRC, encoding='utf-8-sig') as f:
    reader = csv.reader(f, delimiter=';', quotechar='"')
    header = next(reader)  # ID;REC_CODE;MKB_CODE;MKB_NAME;ID_PARENT;ADDL_CODE;ACTUAL;DATE
    for row in reader:
        if len(row) < 8:
            continue
        code, name, actual = row[2], row[3], row[6]
        if actual != '1':
            continue
        code = (code or '').strip().upper()
        name = (name or '').strip()
        if not code or not name:
            continue
        if not CODE_RE.match(code):
            continue
        codes[code] = name  # dict дедуплицирует коды

records = [{'code': c, 'name': codes[c]} for c in sorted(codes)]
print(f'Всего кодов диагнозов: {len(records)}')

# Бэкап старого файла
if os.path.exists(DST):
    bak = DST + '.bak'
    shutil.copy2(DST, bak)
    print(f'Бэкап старого файла: {bak}')

with open(DST, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=1)

# Статистика по главам
from collections import Counter
chapters = Counter(r['code'][0] for r in records)
print('По буквам:', dict(sorted(chapters.items())))