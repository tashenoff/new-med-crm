"""Local synthetic bonus UI screenshots using an already installed Chrome.

Build the task's synthetic preview and serve it on localhost first. No production
URL, real profile, credentials or API requests are permitted by this runner.
"""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:4179')
parser.add_argument('--out', type=Path, required=True)
args = parser.parse_args()
parts = urlsplit(args.base)
assert parts.scheme == 'http' and parts.hostname == '127.0.0.1'
assert not parts.username and not parts.password and parts.path in ('', '/')
origin = f'{parts.scheme}://{parts.netloc}'
args.out.mkdir(parents=True, exist_ok=True)
results, errors, blocked = [], [], []

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, chromium_sandbox=True)
    browser_version = browser.version
    try:
        for device, viewport in [('desktop', {'width': 1440, 'height': 1000}),
                                 ('mobile', {'width': 390, 'height': 844})]:
            context = browser.new_context(viewport=viewport, device_scale_factor=1,
                                          locale='ru-RU', timezone_id='Asia/Almaty',
                                          is_mobile=device == 'mobile', has_touch=device == 'mobile')
            def route_request(route):
                parsed = urlsplit(route.request.url)
                if parsed.scheme + '://' + parsed.netloc == origin:
                    route.continue_()
                else:
                    blocked.append(route.request.url)
                    route.abort()
            context.route('**/*', route_request)
            context.route_web_socket('**', lambda ws: ws.close())
            for state in ('filled', 'empty', 'loading', 'error', 'unset', 'manager', 'viewer'):
                page = context.new_page()
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(origin + '/?state=' + state, wait_until='networkidle')
                expect(page).to_have_title('Бонусы — локальные синтетические данные')
                page.evaluate('document.fonts.ready')
                card = page.locator('[aria-labelledby="bonus-setting-title"]')
                expect(card).to_be_visible()
                if state == 'loading':
                    expect(card).to_have_attribute('aria-busy', 'true')
                    expect(page.get_by_role('status').first).to_be_visible()
                else:
                    expect(card).to_have_attribute('aria-busy', 'false')
                if state == 'manager':
                    expect(page.locator('form')).to_be_visible()
                    expect(page.locator('[aria-labelledby="bonus-register-title"]')).to_have_count(0)
                elif state == 'viewer':
                    expect(page.locator('form')).to_have_count(0)
                    expect(page.locator('tbody tr')).to_have_count(3)
                elif state == 'filled':
                    expect(page.locator('tbody tr')).to_have_count(3)
                    expect(page.locator('tbody')).to_contain_text('Тестовый пациент №1')
                elif state in ('empty', 'unset'):
                    expect(page.get_by_role('heading', name='За выбранный месяц начислений нет.')).to_be_visible()
                    expect(page.locator('table')).to_have_count(0)
                elif state == 'error':
                    expect(page.get_by_role('alert')).to_contain_text('Синтетическая ошибка загрузки')
                    expect(page.locator('table')).to_have_count(0)
                metrics = page.evaluate('''() => {
                    const card = document.querySelector('.curai-bonus-card');
                    const body = card.querySelector('.curai-bonus-card-body');
                    const table = document.querySelector('.curai-bonus-table-scroll');
                    const cs = getComputedStyle(card);
                    return {viewport:innerWidth, document:document.documentElement.scrollWidth,
                      cardBackground:cs.backgroundColor, cardBorder:cs.borderTopWidth,
                      bodyPadding:getComputedStyle(body).paddingLeft,
                      table:table ? {width:table.clientWidth,scrollWidth:table.scrollWidth}:null};
                }''')
                assert metrics['document'] <= viewport['width'] + 1, (device,state,metrics)
                assert metrics['cardBackground'] == 'rgb(255, 255, 255)', metrics
                assert metrics['cardBorder'] == '1px', metrics
                assert metrics['bodyPadding'] == ('16px' if device == 'mobile' else '24px'), metrics
                if device == 'mobile' and metrics['table']:
                    assert metrics['table']['scrollWidth'] > metrics['table']['width']
                    assert page.locator('.curai-bonus-table-hint').is_visible()
                    for badge in page.locator('table .curai-bonus-badge').all():
                        assert badge.evaluate('''node => {
                            const css = getComputedStyle(node);
                            return node.getBoundingClientRect().height <= parseFloat(css.lineHeight)
                              + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) + 1;
                        }'''), 'Accrued status should fit on one line'
                screenshot = args.out / f'{state}-{device}.png'
                page.screenshot(path=str(screenshot), full_page=True, animations='disabled')
                results.append(dict(state=state, device=device, screenshot=screenshot.name, **metrics))
                if device == 'mobile' and state == 'filled':
                    page.locator('.curai-bonus-table-scroll').evaluate('(node) => node.scrollLeft = node.scrollWidth')
                    page.screenshot(path=str(args.out / 'filled-mobile-table-end.png'), full_page=True, animations='disabled')
                page.close()
            context.close()
    finally:
        browser.close()

assert not errors, errors
assert not blocked, blocked
(args.out / 'results.json').write_text(json.dumps(dict(browser='installed Chrome via Playwright', browser_version=browser_version,
    visual_states=results, page_errors=errors, external_requests=blocked,
    production_contacted=False), ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(results)} synthetic viewport/state checks passed; 15 screenshots; no page errors or external requests')
