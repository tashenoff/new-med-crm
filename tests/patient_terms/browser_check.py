"""Own Chromium process/contexts only. All requests restricted to local fixture."""
import json
from pathlib import Path
import re
import traceback
import urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = "http://127.0.0.1:18763"
OUT = Path(__file__).resolve().parents[2] / "consent-evidence"
OUT.mkdir(exist_ok=True)
links = json.load(urllib.request.urlopen(BASE + "/__fixture/links"))
checks = []
errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    admin = browser.new_context(viewport={"width": 1440, "height": 1000})
    mobile = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    for context in [admin, mobile]:
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(BASE + "/") else route.abort())
    admin.add_init_script("localStorage.setItem('token','synthetic-local-only')")
    crm = admin.new_page()
    public = mobile.new_page()
    public_requests = []
    public.on("request", lambda r: public_requests.append({"url": r.url, "headers": r.headers}))
    crm.on("pageerror", lambda e: errors.append(str(e)))
    public.on("pageerror", lambda e: errors.append(str(e)))
    try:
        crm.goto(BASE + "/calendar")
        crm.get_by_title("WhatsApp чаты").click()
        crm.get_by_role("button", name=re.compile("Тестовый пациент Один")).first.click()
        bar = crm.locator('.curai-chat-thread > .patient-terms-status')
        expect(bar).to_contain_text("Условия не приняты")
        assert crm.locator('.curai-chat-header + .patient-terms-status').count() == 1
        checks.append("status is directly under selected WhatsApp header")
        crm.locator('.curai-chat-person button').click()
        card = crm.get_by_role('dialog').locator('.patient-terms-status')
        expect(card).to_contain_text("Условия не приняты")
        expect(card).to_contain_text("demo-2026-10-21-v1")
        response = public.goto(links['pending'])
        assert response.headers['cache-control'] == 'no-store'
        assert response.headers['referrer-policy'] == 'no-referrer'
        checkbox = public.get_by_role('checkbox')
        submit = public.get_by_role('button', name="Подтвердить ознакомление")
        expect(checkbox).not_to_be_checked()
        expect(submit).to_be_disabled()
        assert public.locator('[role="dialog"]').count() == 0
        assert public.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        expect(card).to_contain_text("Условия не приняты")
        public.screenshot(path=str(OUT / 'mobile-pending.png'), full_page=True)
        checks.append("mobile 390px, no overflow, checkbox off, GET/lookup leave status unchanged")
        checkbox.check()
        submit.click()
        expect(public.get_by_role('status')).to_contain_text("Ознакомление подтверждено")
        # Actual HTTP polling, no local event bridge between these isolated contexts.
        expect(bar).to_contain_text("Условия приняты ·", timeout=16000)
        expect(card).to_contain_text("Условия приняты ·", timeout=16000)
        public.screenshot(path=str(OUT / 'mobile-accepted.png'), full_page=True)
        crm.screenshot(path=str(OUT / 'crm-updated.png'), full_page=True)
        checks.append("another browser context acceptance updates open WhatsApp and patient card without reload")
        public.reload()
        expect(public.get_by_role('status')).to_contain_text("Ознакомление подтверждено")
        checks.append("used link shows original confirmation")
        crm.get_by_role('dialog').get_by_role('button', name='Закрыть', exact=True).click()
        crm.screenshot(path=str(OUT / 'crm-widget-updated.png'), full_page=True)
        bar.get_by_role('button', name='Скрыть статус условий').click()
        expect(bar).to_have_count(0)
        crm.get_by_role("button", name=re.compile("Тестовый пациент Два")).first.click()
        expect(crm.locator('.curai-chat-thread > .patient-terms-status')).to_contain_text("Условия не приняты")
        crm.get_by_role("button", name=re.compile("Тестовый пациент Один")).first.click()
        expect(crm.locator('.curai-chat-thread > .patient-terms-status')).to_have_count(0)
        crm.locator('.curai-chat-person button').click()
        expect(crm.get_by_role('dialog').locator('.patient-terms-status')).to_contain_text("Условия приняты ·")
        checks.append("close affects only patient row, chat switch isolated, card still shows accepted status")
        for key, expected in [('expired', 'Срок действия ссылки истёк'), ('revoked', 'Ссылка отозвана')]:
            public.goto(links[key])
            expect(public.get_by_role('alert')).to_contain_text(expected)
        public.goto(BASE + '/consent/#invalid')
        expect(public.get_by_role('alert')).to_contain_text('Ссылка недействительна')
        public.screenshot(path=str(OUT / 'mobile-invalid.png'), full_page=True)
        checks.append("invalid, expired and revoked mobile states")
        assert all('/auth/' not in r['url'] and '/patients/' not in r['url'] for r in public_requests)
        assert all('authorization' not in r['headers'] for r in public_requests)
        assert all('#' not in r['url'] for r in public_requests)
        assert all('referer' not in r['headers'] for r in public_requests if '/api/' in r['url'])
        for link in links.values():
            assert all(link.split('#')[1] not in str(r) for r in public_requests)
        assert not any('/App-' in r['url'] for r in public_requests)
        assert not errors, errors
        checks.append("public page loads no CRM bundle, auth, patient API, token in HTTP URLs/headers, API referrer or third-party requests")
    except Exception:
        crm.screenshot(path=str(OUT / 'failure-crm.png'), full_page=True)
        public.screenshot(path=str(OUT / 'failure-public.png'), full_page=True)
        errors.append(re.sub(r'#[A-Za-z0-9_-]{43}', '#[hidden]', traceback.format_exc()))
    finally:
        browser.close()

result = {"passed": len(checks), "checks": checks, "errors": errors}
(OUT / 'browser-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(result, ensure_ascii=True, indent=2))
if errors:
    raise SystemExit(1)
