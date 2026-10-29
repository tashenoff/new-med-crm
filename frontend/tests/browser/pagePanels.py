"""Run Vite locally with VITE_BACKEND_URL set to the same localhost origin first.
Uses installed Chrome, actual components, and synthetic API responses only.
Example: python tests/browser/pagePanels.py --out C:/Temp/panel-check
"""
import argparse
import json
import subprocess
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:4193')
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--views', default='schedule,doctors,patients,rooms,specialties,payments,prices,finance,tasks,warehouse,broadcast,doctor-statistics,plan-statistics,crm-dashboard,leads')
args = parser.parse_args()
origin = args.base.rstrip('/')
assert urlsplit(origin).hostname == '127.0.0.1'
args.out.mkdir(parents=True, exist_ok=True)
frontend = Path(__file__).resolve().parents[2]
subprocess.run(['node', '-e', "const fs=require('fs');const e=require('esbuild');fs.writeFileSync('tests/browser/pagePanels.fixture.js',e.transformSync(fs.readFileSync('tests/browser/pagePanels.fixture.jsx','utf8'),{loader:'jsx',format:'esm'}).code);"],cwd=frontend,check=True)
results = []
views = args.views.split(',')

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    for device, width in [('desktop',1837), ('mobile',390)]:
        context = browser.new_context(viewport={'width':width,'height':900}, locale='ru-RU')
        for view, state in [(v,'filled') for v in views] + ([('schedule',s) for s in ['empty','pages','viewer','loading','error']] if 'schedule' in views else []):
            page = context.new_page()
            errors = []
            writes = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            def route_request(route):
                request = route.request
                u = urlsplit(request.url)
                if u.path.startswith('/api/'):
                    if request.method not in ['GET','OPTIONS']:
                        writes.append(request.method+' '+u.path)
                    data = []
                    status = 200
                    if u.path.endswith('/rooms'):
                        data = [{'id':'room-1','name':'Тестовый кабинет'}]
                    elif '/doctors/' in u.path and u.path.endswith('/schedule'):
                        data = [] if state == 'empty' else [{'id':'schedule-1','day_of_week':0,'start_time':'09:00','end_time':'18:00'}]
                    elif 'specialties' in u.path:
                        data = [{'id':'specialty-1','name':'Тестовая терапия','created_at':'2026-10-01'}]
                    elif 'payment-types' in u.path:
                        data = [{'id':'payment-1','name':'Тестовая оплата','commission_rate':0,'created_at':'2026-10-01'}]
                    elif '/statistics' in u.path and not '/crm/' in u.path:
                        fields = 'total_doctors total_appointments completed_appointments completion_rate no_show_appointments no_show_rate total_revenue potential_revenue revenue_efficiency avg_revenue_per_appointment cancelled_appointments cancellation_rate avg_appointments_per_doctor total_plans completed_plans in_progress_plans pending_plans no_show_plans total_cost total_paid outstanding_amount collection_rate'.split()
                        data = {'overview':{key:0 for key in fields},'monthly_statistics':[], 'doctor_statistics':[], 'patient_statistics':[], 'summary':{}, 'payment_summary':{key:0 for key in ['paid_plans','partially_paid_plans','unpaid_plans','overdue_plans']}}
                    if state == 'error':
                        status, data = 500, {'detail':'Synthetic error'}
                    route.fulfill(status=status, content_type='application/json', body=json.dumps(data, ensure_ascii=False))
                elif request.url.startswith(origin+'/'):
                    route.continue_()
                else:
                    route.abort()
            page.route('**/*', route_request)
            page.goto(origin+f'/tests/browser/pagePanels.html?view={view}&state={state}', wait_until='domcontentloaded')
            try:
                expect(page.locator('.curai-page-panel')).to_be_visible()
            except AssertionError:
                print('FIXTURE ERROR', view, state, errors, page.locator('body').inner_text()[:300], flush=True)
                raise
            page.evaluate('document.fonts.ready')
            if view == 'schedule' and state not in ['loading','error']:
                expect(page.locator('.curai-page-panel-footer')).to_contain_text('0' if state == 'empty' else '12' if state == 'pages' else '3')
            metrics = page.evaluate('''() => {
              const panel=document.querySelector('.curai-page-panel');
              const header=panel.querySelector(':scope > .curai-panel-header');
              const body=panel.querySelector(':scope > .curai-page-panel-body');
              const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width};};
              return {document:document.documentElement.scrollWidth,panel:rect(panel),header:rect(header),body:rect(body),
                headerBackground:getComputedStyle(header).backgroundColor,bodyBackground:getComputedStyle(body).backgroundColor,
                sections:[...body.querySelectorAll(':scope > .curai-page-panel-toolbar,:scope > .curai-page-panel-filters,:scope > .curai-page-panel-table,:scope > .curai-page-panel-footer')].map(rect)};
            }''')
            assert metrics['headerBackground'] == 'rgb(255, 255, 255)', (view,metrics)
            assert metrics['bodyBackground'] == 'rgb(255, 255, 255)', (view,metrics)
            assert abs(metrics['header']['bottom']-metrics['body']['y']) < 1, (view,metrics)
            assert metrics['document'] <= width+1, (view,state,metrics)
            if view in ['schedule','doctors','patients']:
                for a,b in zip(metrics['sections'], metrics['sections'][1:]):
                    assert abs(a['bottom']-b['y']) < 1, (view,state,metrics)
                    assert abs(a['x']-b['x']) < 1 and abs(a['width']-b['width']) < 1
            if view == 'doctors':
                page.get_by_placeholder('Поиск по имени, специальности или телефону...').fill('Врач 2')
                expect(page.locator('tbody tr')).to_have_count(1)
                page.get_by_placeholder('Поиск по имени, специальности или телефону...').fill('')
            if view == 'patients':
                page.get_by_placeholder('Поиск по имени или телефону...').fill('Отсутствует')
                expect(page.get_by_text('Пациенты не найдены')).to_be_visible()
                page.get_by_placeholder('Поиск по имени или телефону...').fill('')
            if view == 'schedule' and state == 'pages':
                page.locator('.curai-page-panel-footer').get_by_role('button',name='2',exact=True).click()
                expect(page.locator('tbody tr')).to_have_count(2)
            if view == 'schedule' and state == 'viewer':
                expect(page.get_by_role('button',name='+ График врача',exact=True)).to_have_count(0)
            if view == 'schedule' and state == 'filled':
                page.get_by_role('button',name='+ График врача',exact=True).click()
                expect(page.get_by_role('dialog')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.get_by_role('dialog')).to_have_count(0)
                page.locator('.curai-page-panel-filters select').nth(2).select_option('doctor-1')
                expect(page.locator('tbody tr')).to_have_count(1)
                page.locator('.curai-page-panel-filters select').nth(2).select_option('all')
                if device == 'mobile':
                    page.locator('.curai-page-panel-table').evaluate('node => node.scrollLeft = node.scrollWidth')
                    expect(page.get_by_title('Редактировать',exact=True).first).to_be_in_viewport()
                    page.locator('.curai-page-panel-table').evaluate('node => node.scrollLeft = 0')
            if view == 'schedule' and state == 'loading':
                expect(page.get_by_text('Загружаем расписание...')).to_be_visible()
            if view == 'doctor-statistics':
                page.locator('.curai-page-panel-body .group').first.hover()
                assert page.evaluate('document.documentElement.scrollWidth') <= width+1
            assert not errors, (view,state,errors)
            assert not writes, (view,state,writes)
            page.evaluate('document.activeElement?.blur()')
            page.screenshot(path=str(args.out/f'{view}-{state}-{device}.png'), full_page=True)
            results.append({'view':view,'state':state,'device':device,**metrics})
            print('PASS',view,state,device,flush=True)
            page.close()
        context.close()
    version = browser.version
    browser.close()
(args.out/'results.json').write_text(json.dumps({'chrome':version,'results':results},indent=2),encoding='utf-8')
print(f'{len(results)} Chrome cases passed; screenshots and results.json: {args.out}')
(frontend/'tests/browser/pagePanels.fixture.js').unlink()
