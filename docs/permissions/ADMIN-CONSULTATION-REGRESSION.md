# Локальная коррекция регрессий администратора после релиза прав

Базы: backend `b5474b6`, frontend `b6c0087`. Исправление не опубликовано; отдельные review-ветки `audit/legacy-admin-compat-review` и `audit/consultation-footer-review`. Live accounts, permissions, medical records, receipts, MCP, grants и env не читались/не менялись.

## Установленные причины

1. **Консультация.** Submit-кнопка всегда рендерится формой, без условия admin/super_admin или mode. До коррекции её подпись — «Создать»/«Обновить». В окне 1105×850 верх кнопки находился на y=851.5, низ на 887.5; после прокрутки полей до конца она оставалась обрезана. Consent banner над формой занимал дополнительную высоту, но форма занимала 100% родителя, у которого overflow:hidden. Это ошибка компоновки, а не отсутствие прав на рендер кнопки.
2. **Согласие.** PatientTermsStatus был общим ребёнком dialog body, поэтому показывался над всеми вкладками. По уточнённому требованию он теперь монтируется только на «Информации». WhatsApp placement/refresh не менялись.
3. **Оплата и редактирование сотрудников.** До per-action enforcement admin авторизовался ролью в staff management и clinical payment endpoints. Старый ROLE_PERMISSIONS[admin] при этом не содержал staff_edit/finance_edit. Новый сервер/клиент проверял именно эти ключи: StaffManagementPage скрывал весь столбец действий, PaymentPlanDetails отключал кнопку через loading || !allowPayment. При неподвижном loading=false и неоплаченном обычном плане причиной был отсутствующий finance_edit. Для full_payment_v1 дополнительно требуется patients_edit, поскольку платёж завершает процедуры. Состояние «оплачено 0, остаток 11500» само по себе кнопку не блокирует.

На синтетическом legacy admin воспроизведены оба отказа. Реальный permission_mode пользователя не читался: скриншот показывает роль, но не её флаг в хранилище. Explicit аккаунт с ограниченным набором должен оставаться ограниченным.

## Минимальная коррекция

- В effective_permissions для **legacy admin/super_admin** сохранены две прежние role-authorized операции: staff_edit и finance_edit. Это вычисление ответа login/me и staff projection, без обновления записей. ROLE_PERMISSIONS/preset не расширен; новая explicit роль и explicit [] не получают этих ключей. Marketer CRM-only не меняется. Payroll, delete/export keys не добавляются. Прежние запреты self-escalation и управления senior targets сохранены.
- PatientTermsStatus условен activeTab==='info'. Для consultation dialog body и form container задана связная flex/min-height:0 компоновка. Прокручиваются поля, footer остаётся видимым в пределах окна. Подпись submit уточнена до «Сохранить консультацию»/«Сохранить изменения».
- Логика бухгалтерского ledger, создание планов и финансовые суммы не менялись. No blanket admin bypass; explicit режим не объединяется с ролью.

## Проверки

- 849 backend mock-only tests; новый genuine HTTP receipt route использует sentinel ledger writer, без финансовой записи. Legacy admin проходит staff create/edit и receipt boundary; explicit restricted admin и CRM-only получают 403; существующие fixture accounts не мигрируют, payroll отсутствует.
- 592 frontend tests, 179 целевых consultation/consent/payment/staff tests, production build и git diff --check — passed.
- Browser 1105×850: 4 admin/super_admin × legacy/explicit authorized cases. До коррекции кнопка обрезана; после — y≈768..804, clickable при открытых/скрытых дополнительных полях. Каждая форма делает ровно один intercepted synthetic save; настоящие medical endpoints не вызываются.
- Browser 1280×850: 5 cases с permissions, вычисленными настоящим backend resolver. Legacy admin/super_admin и явно разрешённый explicit admin открывают оплату 11500 и отправляют ровно один intercepted receipt; restricted explicit admin/super_admin остаются disabled и не отправляют запрос. Staff edit доступен только соответствующим cases. PatientTermsStatus присутствует на Info, отсутствует на consultation/documents/treatment/analyses/payment. Payroll отсутствует у всех пяти.
- Evidence executor: `evidence/consultation-before/results.json`, `consultation-fixed/results.json`, `legacy-admin-ui/results.json`, `admin-regression-full-backend.log`, `admin-regression-full-frontend.log`, `consultation-footer-build.log`. QA scripts — `browser-qa/consultation-footer.mjs`, `legacy-admin-payment.mjs`.

Проверка опубликованного исправления и реальные аккаунты в этот прогон не входили. Публикация только по отдельной команде. После backend correction существующий JWT перечитывает права на каждом запросе; клиенту достаточно focus/refresh, ручная выдача этих двух прав legacy администратору не нужна.
