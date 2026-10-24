# Финальная совместимость пакета прав сотрудников

Проверена интеграция поверх published `main/8632c99849524317cd8eee4e7a8fc59d340c47b5` и `ref-2/0f8f436f08ee9552870c51934ab609678fadfb50`. Consent refresh `068e828`, source-prefill, источники и воронка сохранены. Production MCP resolver, grants, webhooks, конфигурация и данные существующих сотрудников не менялись.

## Проверено локально

- Backend HTTP: настоящие зарегистрированные routers, JWT, StaffService и DocumentService; база заменена строгим хранилищем в памяти, файлы — синтетические, lifespan/background workers отключены. 115 дополнительных compatibility cases входят в полный mock-only набор. Неподдерживаемый запрос фикстуры завершается ошибкой, а не обращается к MongoDB.
- Clinic preflight: каждая из 25 коллекций отдельно. Отсутствующий `clinic_id` и ожидаемый `synthetic-clinic` разрешены. Foreign ID и явный `null` приводят к 403. Аналогично проверены users/staff при login. Это проверка single-clinic quarantine, не реализация общей multi-tenant БД.
- Legacy роли super_admin/admin/doctor/marketer/administrator сохраняют прежний набор плюс ранее явные custom permissions при login/me, без автоматических новых keys или payroll. Простое открытие карточки не меняет mode/данные. Для управляющих действий по-прежнему нужны соответствующие staff keys и подходящая роль; один лишь admin role не выдаёт staff_edit.
- Реальный HTTP round-trip: create → запись users/staff explicit → повторное открытие → имя без изменения прав → [] → обновлённый `/auth/me` с тем же JWT. Создание с отсутствующим списком даёт deny-all.
- Защищённый документ: реальная multipart upload и скачивание совпадающих синтетических байтов; anonymous/CRM-only/view-only отказаны, публичный `/uploads` закрыт, незарегистрированное имя и traversal не выдаются. Patient account читает только собственный зарегистрированный документ при наличии ключей.
- Compatibility change документов подтверждён намеренно: legacy admin без `patients_export` получает 403 на скачивание; legacy account с ранее явным export сохраняет доступ. Список документов и скачивание — разные права. Старый публичный mount не возвращён. Для рабочих сотрудников, которым нужно скачивание, соответствующее право выдаётся вручную уполномоченным администратором, без массового расширения.
- Browser localhost:5187 → настоящий HTTP localhost:52173: форма создаёт marketer с ровно crm_view/crm_edit; роль не добавляет HMS; повторное сохранение не расширяет набор. Новый пользователь перенаправлен с `/patients`, прямые HMS API возвращают 403. После административного изменения focus обновляет сессию. Legacy marketer переводится через настоящую форму, старый JWT уже видит новый набор.
- Найденный staging дефект исправлен: login-only сотрудник больше не отправляет `email: ""` (422 EmailStr); пустой optional email исключается из create payload. Выбранные explicit права не меняются.

Display API остальных панелей в браузере используют моки; actual staff/auth traffic не подменяется. Прогон не является проверкой live пациентов, всех клинических сценариев или production database configuration. Полный deny-by-default surface test отдельно покрывает зарегистрированные API.

## Что требует действительной конфигурации

Не читались production users/documents/grants, clinic IDs в реальной БД, секреты или env. Поэтому не заявляется, что production данные уже соответствуют clinic preflight. Эффективный ID выбирается как APP_CLINIC_ID, иначе CONSENT_CLINIC_ID, иначе `clinic`. Явный foreign/null clinic_id в известных коллекциях блокирует бизнес API; отсутствующий ID трактуется как данные текущей одноклинической установки. Проблемный ID нельзя исправлять массово или отключать границу ради запуска: сначала оператор подтверждает принадлежность и согласует отдельное действие.

Отдельное известное ограничение MCP сохраняется: ограниченный explicit admin/super_admin с существующим действующим reporting grant может иметь finance через старое сложение роли в resolver. CRM-only marketer в этой ситуации finance не получает; payroll не выдаётся автоматически. Это не блокер обычной JWT-сессии маркетолога и не исправляется изменением grants в этой поставке.

## Как администратору перевести уже созданного маркетолога

1. После согласованного backend/frontend deployment войти под другим уполномоченным администратором со staff_view/staff_edit. У обычного admin должны быть эти права и выдаваемые CRM keys; защищённый super_admin путь сохранён.
2. Открыть «Сотрудники» → нужный сотрудник → «Редактировать». Проверить имя/логин; не менять пароль, активность или роль без необходимости. У legacy карточки сначала показан **эффективный старый** набор, включая HMS от роли.
3. Нажать «Снять все права». Отметить в группе CRM «Просмотр» и, если сотрудник ведёт CRM, «Создание / изменение». Удаление и экспорт добавлять только при реальной необходимости. HMS, склад, финансы и payroll оставить снятыми. Не нажимать «Применить шаблон роли», если цель — точный ограниченный набор.
4. Нажать «Сохранить». Это явная замена (`permission_mode=explicit`, точный custom_permissions). Повторно открыть карточку и убедиться, что отмечен только согласованный CRM набор.
5. Сотруднику обновить страницу/вернуться во вкладку или заново войти. `/auth/me` обновляется по focus и периодически; backend читает текущие права на каждом запросе и не ждёт истечения старого JWT. Проверить отсутствие HMS и отказ прямого HMS URL/API.

Эти действия здесь выполнялись только над synthetic account. Реальный маркетолог и прочие аккаунты не изменены. Массовая миграция legacy ролей не запускалась.

## Доказательства

- `backend/tests/mock_only/test_permission_staging.py` и `permission_staging_app.py` — повторяемая HTTP/clinic/file проверка без Mongo.
- Executor: `task-3/evidence/backend-0f8f436-regression.log`, `frontend-integrated-serial-regression.log`, `staging-final-real-browser.log`, `browser-sources-permissions-final.log`, `frontend-final-staging-build.log`; `task-3/browser-qa/permission-staging.mjs` — browser harness.
- Первоначальный локальный порт 5191 оказался занят; synthetic login был отклонён валидацией 422 до каких-либо сохранений. Чужой процесс не изменялся. Успешный HTTP staging запускался на отдельном порту 52173.

Финальный integrated результат: 848 backend mock-only tests, 592 frontend tests (полный последовательный прогон после ошибки транспорта Node runner), 6 неизменяющих MCP compatibility tests, production build, 9 mocked browser cases и 3 browser cases с настоящим local HTTP backend. Подготовленный scope — права сотрудников в одноклинической установке. Реальная конфигурация отдельно не читалась и не выдаётся за проверенную. Публикация разрешена пользователем после завершения предшествующего пакета; порядок backend → deploy/smoke → frontend, без force push, live миграций или изменения accounts/grants/env.


Коррекция регрессий legacy-admin/consultation footer подготовлена отдельно после этой проверки: [ADMIN-CONSULTATION-REGRESSION.md](ADMIN-CONSULTATION-REGRESSION.md). Она восстанавливает staff_edit/finance_edit только как совместимость прежних legacy admin операций, без изменения role presets, explicit аккаунтов или payroll. Предыдущее утверждение об отсутствии staff_edit у legacy admin описывало обнаруженную несовместимость, а не желаемое поведение.
