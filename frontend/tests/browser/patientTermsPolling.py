"""Real published/local frontend; all API calls mocked, no production data/writes.

--expect-fixed requires the focus recovery. --base selects a local Vite build.
"""
import argparse
import json
from pathlib import Path
import re
import time
from urllib.parse import urlsplit
import asyncio
from playwright.async_api import async_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='https://www.curai.asia')
parser.add_argument('--expect-fixed', action='store_true')
args = parser.parse_args()
OUT = Path.cwd() / 'consent-polling-evidence'
OUT.mkdir(exist_ok=True)
patients = [{'id': 'polling-synthetic-one', 'full_name': 'Тест синхронизации Один', 'phone': '+70000000001'},
            {'id': 'polling-synthetic-two', 'full_name': 'Тест синхронизации Два', 'phone': '+70000000002'}]
accepted = {p['id']: False for p in patients}
hold = False
held = []
status_requests = []
assets = []
errors = []
checks = []

async def main():
    global hold
    async with async_playwright() as p:
        release = asyncio.Event()
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1440, 'height': 1000})
        await context.add_init_script("localStorage.setItem('token','synthetic-test-only')")
        if hasattr(context, 'route_web_socket'):
            await context.route_web_socket('**', lambda ws: ws.close())
        async def api(route):
            global hold
            request = route.request
            url = urlsplit(request.url)
            path = url.path
            if path.startswith('/api/'):
                assert request.method in ('GET', 'OPTIONS'), 'All API writes forbidden'
                if request.method == 'OPTIONS':
                    await route.fulfill(status=204, headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS'})
                    return
                if path.endswith('/terms-status'):
                    patient = path.split('/')[-2]
                    status_requests.append({'patient': patient, 'url': request.url, 'time': time.monotonic()})
                    if hold:
                        held.append(route)
                        await release.wait()
                    data = {'accepted': accepted.get(patient, False), 'accepted_at': '2026-10-21T12:00:00Z' if accepted.get(patient) else None,
                            'version': 'synthetic-v1', 'demonstration': True, 'history': ([{'accepted_at':'2026-10-21T12:00:00Z','document':{'version':'synthetic-v1','title':'Демонстрационный тест','text':'Synthetic only','demonstration':True}}] if accepted.get(patient) else [])}
                elif path == '/api/auth/me':
                    data = {'id': 'polling-synthetic-admin', 'full_name': 'Только тест', 'role': 'super_admin', 'permissions': [], 'is_active': True}
                elif path == '/api/patients':
                    data = patients
                elif path == '/api/wazzup/chats':
                    data = {'chats': [{'phone': x['phone'], 'patient_id': x['id'], 'patient_name': x['full_name'], 'source': 'patient'} for x in patients], 'total': 2}
                elif '/wazzup/messages/history/' in path:
                    data = {'messages': []}
                elif path == '/api/crm/whatsapp/kanban-stage':
                    data = {'columns': [], 'current_label': 'Этап сделки', 'can_move': False}
                elif path == '/api/wazzup/connection':
                    data = {'connected': False, 'status': 'offline'}
                else:
                    data = []
                await route.fulfill(status=200, content_type='application/json', headers={'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*'}, body=json.dumps(data))
                return
            if request.method == 'GET' and (url.netloc in ('curai.asia', 'www.curai.asia') or url.netloc == urlsplit(args.base).netloc):
                if path.endswith('.js'):
                    assets.append(request.url)
                await route.continue_()
            else:
                await route.abort()
        await context.route('**/*', api)
        page = await context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        async def open_both():
            await page.get_by_title('WhatsApp чаты').click()
            await page.get_by_role('button', name=re.compile('Тест синхронизации Один')).first.click()
            bar = page.locator('.curai-chat-thread > .patient-terms-status')
            await expect(bar).to_contain_text('Условия не приняты')
            await page.locator('.curai-chat-person button').click()
            card = page.get_by_role('dialog').locator('.patient-terms-status')
            await expect(card).to_contain_text('Условия не приняты')
            return bar, card
        try:
            await page.goto(args.base + '/calendar', wait_until='networkidle')
            bar, card = await open_both()
            # Only backend fixture state changes; no event/state injection into UI.
            started = time.monotonic()
            accepted[patients[0]['id']] = True
            await expect(card).to_contain_text('Условия приняты ·', timeout=14000)
            await expect(bar).to_contain_text('Условия приняты ·', timeout=14000)
            normal_latency = round(time.monotonic() - started, 2)
            checks.append(f'Actual open PatientModal and WhatsApp row update on HTTP polling in {normal_latency}s without reload')
            first = page.get_by_role('dialog').locator('form.space-y-4 > div').nth(0)
            second = page.get_by_role('dialog').locator('form.space-y-4 > div').nth(1)
            panel_box, first_box, second_box = await card.bounding_box(), await first.bounding_box(), await second.bounding_box()
            status_gap = round(first_box['y'] - panel_box['y'] - panel_box['height'], 2)
            field_gap = round(second_box['y'] - first_box['y'] - first_box['height'], 2)
            if args.expect_fixed:
                assert abs(status_gap - field_gap) <= 1 and status_gap >= 15, (status_gap, field_gap)
            checks.append(f'Desktop spacing: status/form {status_gap}px, field/field {field_gap}px')
            await card.locator('summary').click()
            expanded_box = await card.bounding_box()
            first_box = await first.bounding_box()
            expanded_gap = round(first_box['y'] - expanded_box['y'] - expanded_box['height'], 2)
            if args.expect_fixed:
                assert abs(expanded_gap - field_gap) <= 1 and expanded_gap >= 15, (expanded_gap,field_gap)
            checks.append(f'Expanded history/form gap: {expanded_gap}px')
            await page.screenshot(path=str(OUT / ('fixed-expanded-desktop.png' if args.expect_fixed else 'published-expanded-desktop.png')),full_page=True)
            accepted[patients[0]['id']] = False
            await page.reload(wait_until='networkidle')
            bar, card = await open_both()
            hold = True
            deadline = time.monotonic() + 15
            while len(held) < 2 and time.monotonic() < deadline:
                await page.wait_for_timeout(100)
            assert len(held) >= 2, 'Expected pending requests for both real UI components'
            accepted[patients[0]['id']] = True
            hold = False
            before = len(status_requests)
            # Native focus event only, not a custom consent event or UI-state write.
            assert await page.evaluate('document.hidden') is False
            await page.evaluate("window.dispatchEvent(new Event('focus'))")
            await page.wait_for_timeout(1300)
            recovered = 'Условия приняты ·' in (await card.inner_text()) and 'Условия приняты ·' in (await bar.inner_text())
            after = len(status_requests)
            if args.expect_fixed:
                assert recovered and after >= before + 2, 'Focus must abort old requests and fetch fresh server status for both surfaces'
                assert all('_consent_refresh=' in item['url'] for item in status_requests), 'Polling must bypass stale URL caches'
                checks.append('Visible-window focus recovers both stalled status requests without reload, using fresh server GETs')
            else:
                assert not recovered and after == before, 'Baseline reproduction changed unexpectedly'
                checks.append('Published baseline reproduced stale card/row: stalled poll + visible-window focus does not refetch')
                await page.screenshot(path=str(OUT / 'published-stale-focus.png'), full_page=True)
                await page.reload(wait_until='networkidle')
                await page.get_by_title('WhatsApp чаты').click()
                await page.get_by_role('button', name=re.compile('Тест синхронизации Один')).first.click()
                await page.locator('.curai-chat-person button').click()
                await expect(page.get_by_role('dialog').locator('.patient-terms-status')).to_contain_text('Условия приняты ·')
                checks.append('Same published build sees acceptance immediately after reload against unchanged fixture state')
            await page.screenshot(path=str(OUT / ('fixed-focus.png' if args.expect_fixed else 'published-after-reload.png')), full_page=True)
            if args.expect_fixed:
                await page.set_viewport_size({'width':390,'height':844})
                panel_box = await page.get_by_role('dialog').locator('.patient-terms-status').bounding_box()
                first_box = await page.get_by_role('dialog').locator('form.space-y-4 > div').nth(0).bounding_box()
                second_box = await page.get_by_role('dialog').locator('form.space-y-4 > div').nth(1).bounding_box()
                mobile_gap = round(first_box['y'] - panel_box['y'] - panel_box['height'],2)
                mobile_field_gap = round(second_box['y'] - first_box['y'] - first_box['height'],2)
                assert abs(mobile_gap - mobile_field_gap) <= 1 and mobile_gap >= 15, (mobile_gap,mobile_field_gap)
                await page.screenshot(path=str(OUT/'fixed-mobile.png'),full_page=True)
                checks.append(f'Mobile 390px spacing: status/form {mobile_gap}px, field/field {mobile_field_gap}px')
                await page.set_viewport_size({'width':1440,'height':1000})
                await page.get_by_role('dialog').get_by_role('button',name='Закрыть',exact=True).click()
                await page.get_by_role('button',name=re.compile('Тест синхронизации Два')).first.click()
                await expect(page.locator('.curai-chat-thread > .patient-terms-status')).to_contain_text('Условия не приняты')
                await page.locator('.curai-chat-person button').click()
                await expect(page.get_by_role('dialog').locator('.patient-terms-status')).to_contain_text('Условия не приняты')
                checks.append('Switching patients keeps card and WhatsApp row isolated from the old accepted patient')
            assert not errors, errors
        except Exception as error:
            errors.append(str(error))
        finally:
            release.set()
            await asyncio.sleep(0.2)
            await context.unroute_all(behavior="wait")
            await browser.close()

asyncio.run(main())

result = {'base': args.base, 'fixed': args.expect_fixed, 'checks': checks, 'errors': errors, 'assets': sorted(set(assets)),
          'status_request_count': len(status_requests), 'all_api_mocked': True, 'live_patient_or_acceptance_writes': False}
(OUT / ('fixed-results.json' if args.expect_fixed else 'published-results.json')).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
if errors:
    raise SystemExit(1)
