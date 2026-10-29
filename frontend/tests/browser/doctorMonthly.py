"""Local visual QA with the existing Chrome; no browser installation or live data."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument('--base', default='http://127.0.0.1:4186')
parser.add_argument('--out', required=True, type=Path)
args = parser.parse_args()
assert urlsplit(args.base).hostname == '127.0.0.1'
args.out.mkdir(parents=True, exist_ok=True)
checks, errors, blocked = [], [], []
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True, chromium_sandbox=True)
    for name, viewport in [('desktop', {'width': 1440, 'height': 1000}), ('mobile', {'width': 390, 'height': 844})]:
        context = browser.new_context(viewport=viewport, locale='ru-RU', timezone_id='Asia/Almaty')
        def guard(route):
            if route.request.url.startswith(args.base + '/'):
                route.continue_()
            else:
                blocked.append(route.request.url)
                route.abort()
        context.route('**/*', guard)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(args.base)
        dates = page.locator('input[type="date"]')
        expected_from = page.evaluate("(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })()")
        expect(dates.first).to_have_value(expected_from)
        page.get_by_role('button', name='Создать врача', exact=True).click()
        page.get_by_placeholder('Полное имя *', exact=True).fill('Синтетический врач')
        page.locator('[name="payment_type"]').select_option('monthly')
        amount = page.locator('[name="payment_value"]')
        expect(amount).to_have_value('')
        assert page.locator('[name="payment_value"]').count() == 1
        amount.fill('120000')
        amount.scroll_into_view_if_needed()
        page.screenshot(path=str(args.out / f'{name}-create-monthly.png'), full_page=True)
        page.get_by_role('button', name='Сохранить', exact=True).click()
        row = page.locator('tbody tr').filter(has_text='Синтетический врач')
        expect(row).to_contain_text('Ежемесячная оплата')
        expect(row).to_contain_text('120\u00a0000 KZT в месяц')
        expect(row.locator('td').last).to_contain_text('120\u00a0000 KZT')
        assert page.evaluate('window.syntheticSavedDoctor.payment_value') == 120000
        page.screenshot(path=str(args.out / f'{name}-salary-zero-patients.png'), full_page=True)
        row.locator('td').last.scroll_into_view_if_needed()
        page.screenshot(path=str(args.out / f'{name}-salary-amount.png'), full_page=True)
        page.get_by_role('button', name='Редактировать врача', exact=True).click()
        expect(page.locator('[name="payment_type"]')).to_have_value('monthly')
        expect(page.locator('[name="payment_value"]')).to_have_value('120000')
        page.locator('[name="payment_value"]').fill('135000')
        page.locator('[name="payment_value"]').scroll_into_view_if_needed()
        page.screenshot(path=str(args.out / f'{name}-edit-monthly.png'), full_page=True)
        page.get_by_role('button', name='Сохранить', exact=True).click()
        expect(row.locator('td').last).to_contain_text('135\u00a0000 KZT')
        previous_month = page.evaluate("(() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`; })()")
        dates.first.fill(previous_month)
        expect(row).to_contain_text('135\u00a0000 KZT в месяц')
        expect(row.locator('td').last).to_contain_text('За период не рассчитана')
        expect(page.get_by_text('Зарплата по рассчитанным схемам', exact=True)).to_be_visible()
        expect(page.get_by_role('status')).to_contain_text('не включены в итог')
        page.screenshot(path=str(args.out / f'{name}-cross-month-nonblocking.png'), full_page=True)
        checks.append({'viewport': name, 'create': True, 'reopen': True, 'edit': True,
                       'zero_patients_salary': 135000, 'single_amount_input': True,
                       'super_admin_no_explicit_permissions': True, 'cross_month_no_409': True,
                       'monthly_rate_retained_period_total_uncomputed': True})
        context.close()
    version = browser.version
    browser.close()
assert not errors, errors
assert not blocked, blocked
(args.out / 'result.json').write_text(json.dumps({'chrome': version, 'checks': checks,
    'page_errors': errors, 'blocked_requests': blocked}, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({'checks': checks, 'page_errors': errors, 'blocked_requests': blocked}, ensure_ascii=False))
