# Аудит выдачи прав MedCRM — 21.10.2026

Результат: причина CRM-only → HMS воспроизведена; локально реализованы точный набор прав, четыре группы настройки, guards URL и серверный enforcement. Это локальный кандидат на review, не разрешение на публикацию. Live аккаунты, роли, настройки, пациенты, MCP и grants не менялись. Push/deploy не выполнялись.

## Причина и доказательства

1. `StaffModal` называл чекбоксы доступом к разделам, но передавал `custom_permissions`. `StaffMember.get_permissions`, login и `/auth/me` вычисляли **роль + custom_permissions**. У marketer роль добавляет `patients_view`, `crm_view`, `crm_edit`, `statistics_view`. Поэтому один отмеченный CRM не исключал пациентов и статистику HMS. Пустой список тоже не снимал права роли.
2. Скриншот Library `libfile_bc81bfcb5ee481919d523f92b1a3e8ba` получен в собственном executor и просмотрен как изображение: только «Доступ к CRM» отмечен, выше прямо написано «Просмотр пациентов, полный доступ к CRM, просмотр статистики». Это не доказательство конкретных сохранённых live данных, а подтверждение противоречивого интерфейса. Синтетическая модель подтверждает поведение backend.
3. `WorkspaceTabs` всегда показывал HMS, финансы — всем не пациентам. `App` монтировал прямые HMS URL без permission guard. Навигация имела bypass для admin/super_admin.
4. CRM CRUD часто не имел auth dependency. Инвентарь без нового общего guard выявляет 64 операции в CRM/чатах/телефонии без собственной auth dependency. Исходный `/api/uploads/{filename}` также был без авторизации, а `/uploads` монтировался публично.
5. `/doctors/salary-report` пропускал marketer и других сотрудников по роли. Списки врачей отдавали ставки и индивидуальные комиссии. Эти пути теперь требуют/учитывают явный `payroll_view`.
6. Обнаружен и исправлен переходный frontend дефект: после redirect URL менялся раньше дублированного `activeTab`, и запрещённый экран зарплат успевал монтироваться. Вкладка теперь вычисляется прямо из URL.

## Изолированные ветки и координация

- Backend: `audit/permissions-backend`, каталог `task-3/audit-repo`, основан на актуальном `ref-2/f5f73dc`.
- Frontend: `audit/permissions-frontend`, каталог `task-3/frontend-audit`, основан на актуальном `main/facd25f`.
- Исходный `E:\new-med-crm` с чужими изменениями не изменялся. Чужие checkout/browser не использовались.
- Воронка, источники и DID mapping сохранены локальным rebase своих коммитов. Включены `facd25f`, `bae3d31`, `f5f73dc`, consent routing `45ea986` и ранее опубликованный backend consent. Новый DID CRUD дополнительно получает CRM guard, его существующая admin/super_admin защита записи сохранена.
- Возможные пересечения дальнейших работ: backend `routers/auth.py`, `routers/staff.py`, `routers/doctors.py`, `routers/documents.py`, `routers/live_events.py`, `server.py`; frontend `App.jsx`, AuthContext, navigationCatalog, StaffModal. PatientModal/PatientTermsStatus и обработка consent не редактировались.

## Семантика сохранения

| Ситуация | Результат |
|---|---|
| Создание: список отсутствует | `permission_mode=explicit`, прав нет |
| Создание/обновление: `custom_permissions=[]` | Явно нет бизнес-доступа |
| Обновление: поле отсутствует | Текущий набор сохраняется |
| Обновление: список передан | Полная замена; роль не добавляет права |
| `null`, неизвестный ключ, запрос режима `legacy` | Ошибка валидации, без сохранения |
| Смена роли без списка | Существующий эффективный набор фиксируется явно; новые права роли не добавляются |
| Старая запись без режима | Legacy совместимость до адресного пересохранения; массовой миграции нет |
| Повторное открытие legacy | Показан эффективный набор, а не только старые дополнительные флажки |
| «Применить шаблон роли» | Отдельное явное действие, заменяет видимые флажки, не включает payroll |

Шаблон роли — статический preset, индивидуальные права — сохранённый explicit набор. Динамический редактор сущностей ролей в этом проекте отсутствует; он не объявляется реализованным. Старые ROLE_PERMISSIONS заморожены: добавление новых enum ключей не расширяет существующие роли. SUPER_ADMIN не получает PAYROLL_VIEW автоматически.

Права зеркалируются в `staff` и `users`; JWT хранит идентификатор, а права перечитываются из DB на каждый запрос. Потеря staff-проекции не должна вернуть роль из users с более широкими defaults. UI обновляет сессию при фокусе и раз в минуту; API запрещает доступ сразу при следующем запросе с тем же JWT. WebSocket перечитывает права перед отправкой события.

## Матрица пространств и действий

`*_edit` означает общее право **создания и редактирования**, поскольку отдельного существующего create-контракта нет. Это явно подписано в UI. Просмотр требуется дополнительно к изменению, удалению и экспорту. Наличие ключа не создаёт отсутствующий endpoint или готовый модуль. Дополнительные ограничения роли/владения внутри старых маршрутов сохранены как AND и могут ограничить разрешённую операцию сильнее.

| Пространство / возможность | Просмотр | Создание / изменение | Удаление | Экспорт | Состояние / особые условия |
|---|---|---|---|---|---|
| HMS: пациенты, планы, консультации, документы | `patients_view` | `patients_edit` | `patients_delete` | `patients_export` для скачивания документов | implemented API; сохранены исходные ограничения роли/пациента |
| HMS: календарь, записи, кабинеты/расписание | `calendar_view` | `calendar_edit` | `calendar_delete` | отдельного API нет | implemented; отдельные кабинеты также видны в справочниках UI |
| HMS: врачи | `doctors_view` | `doctors_edit` | `doctors_delete` | отдельного API нет | ставки скрываются без payroll; настройка ставок/создание врача дополнительно требуют `payroll_view` |
| HMS: справочники, цены, лаборатории, импорт | `directory_view` | `directory_edit` | `directory_delete` | отдельного общего API нет | implemented/partial; preview импорта тоже требует edit |
| HMS: статистика и отчёт услуг | `statistics_view` | нет общего write API | нет | UI-операции требуют отдельного последующего выравнивания | implemented чтение; детализация и original role guards остаются |
| HMS: рассылки | `broadcast_view` | `broadcast_edit` | отдельного API нет | нет | partial: выбор адресатов требует patients_view; общая отправка сообщения допускает CRM **или** broadcast view/edit; правила требуют system_settings |
| HMS: лояльность | `loyalty_view` | `loyalty_edit` | `loyalty_delete` | нет | implemented/partial; cashback и настройки выплат врачам дополнительно требуют payroll |
| HMS: оценка качества / feedback | `quality_view` | `quality_edit` | `quality_delete`, если маршрут имеется | нет | partial; старые административные ограничения сохранены |
| HMS: сотрудники | `staff_view` | `staff_edit` | `staff_delete` | нет | дополнительно admin/super_admin; защита более привилегированных целей, reset/revoke/assign |
| HMS: настройки, AI/общие insights, правила | `system_settings` | тот же ключ | тот же ключ | нет | ограничено из-за возможности агрегировать данные нескольких пространств |
| CRM: заявки, воронка, клиенты/контакты, сделки, задачи, статусы, источники | `crm_view` | `crm_edit` | `crm_delete`, где DELETE имеется | `crm_export`, если операция реализована | implemented/partial; часть export/delete пока missing |
| CRM: телефония и WhatsApp | `crm_view` | `crm_edit` | `crm_delete`, если маршрут имеется | отдельного общего API нет | implemented/partial; сохранение в пациента/действия с записью требуют также patients_edit |
| CRM: входящие номера → источник | `crm_view` | `crm_edit` | `crm_delete` | нет | опубликованный DID mapping включён; запись дополнительно admin/super_admin, исходная защита сохранена |
| CRM ↔ HMS: клинические детали | `crm_view` + `patients_view` | CRM/HMS edit согласно CSV | — | — | CRM-only получает 403 на HMS details |
| CRM → HMS: конвертация и запись | CRM + patients view | CRM + patients edit; calendar view/edit для записи | — | — | `create_hms_patient=false` оставляет CRM-only конвертацию; депозит дополнительно требует finance view/edit |
| CRM ↔ финансы: агрегаты HMS | `crm_view` + `finance_view` | синхронизация требует CRM/HMS edit | — | — | CRM-only dashboard эти запросы больше не делает |
| Склад: материалы, удалённые, инвентаризация | `warehouse_view` | `warehouse_edit` | `warehouse_delete` | `warehouse_export` на `/materials/export` | implemented/partial; возврат удалённого — существующий POST restore (edit) |
| Финансы: dashboard, доходы, расходы, обычные отчёты | `finance_view` | `finance_edit` (резерв контракта) | `finance_delete` (резерв) | `finance_export` (резерв) | **partial/demo**: hardcoded frontend, отсутствует полноценный CRUD API; UI теперь помечен демонстрационным |
| Финансы: клинические оплаты/депозит/receipts | `patients_view` + `finance_view` | `finance_edit` | отдельного удаления оплаты здесь нет | нет | implemented специальные действия; exact mapping в CSV |
| Финансы: персональные зарплаты/ставки | `payroll_view` явно | настройка комиссии: doctors_edit + payroll_view | нет отдельного payroll CRUD | отдельного API нет | implemented отчёт с существующей fail-closed проверкой полноты; finance_view не даёт payroll |
| Reporting/MCP finance/payroll summary | существующие scoped grants + собственная clinic проверка | нет | нет | read-only | **не изменялись**; см. blocker ниже |

Полный перечень 305 зарегистрированных HTTP-операций: [api-inventory.csv](api-inventory.csv). В CSV `&` — AND, `|` внутри условия — OR. Включены методы, path, модуль, требуемые ключи, исходные зависимости. Регистрируемые операции с пустыми правами проверены реальными ASGI запросами; неизвестная API семья закрыта по умолчанию. Публичные login/register, consent token endpoints и существующие provider webhooks перечислены явно. Consent сохраняет собственную token-защиту. У публичных provider webhooks проверка источника требует отдельного review, см. ограничение ниже.

Минимальный общий ресурс: `/api/lookups/doctors` возвращает только id, имя, специальность, цвет календаря (максимум 500); без телефона, ставок, комиссий, services и остальной карточки. Доступен одному из calendar/patients/doctors/CRM/payroll view для назначения врача и подписей. Это не разрешение открыть HMS URL или полную `/api/doctors`.

## Что закрыто сервером

- Общий guard установлен после всех router registrations; существующие role/ownership checks остаются обязательными.
- Нет blanket bypass для admin/super_admin в permissions; административная роль даёт право управлять только при наличии staff permissions.
- Непривилегированный пользователь не создаёт сотрудников и не меняет свои права. Обычный admin не назначает super_admin, не выдаёт отсутствующие у себя права и не сбрасывает/отзывает более привилегированный аккаунт через альтернативные doctor routes.
- Super admin с действующим staff_view/staff_edit может явно назначить права, включая payroll. При редактировании себя нельзя снять собственный административный путь, деактивировать себя или понизить роль: такое изменение должен сделать другой super admin. Это ошибка, не молчаливое добавление флажков.
- При пересоздании врачебного логина сохраняется его текущий набор; коллизия с неврачебным аккаунтом запрещена.
- Зарплатный HTTP отчёт закрыт без payroll даже при отдельном монтировании doctors router. Списки врачей редактируют ответ и удаляют фактические ставки/комиссии без payroll. Cashback защищён отдельно.
- CRM/WhatsApp/телефония не становятся обходом HMS через вложенные поля: без patients_view убираются patient links/IIN/клинические поля, без finance_view — подмешанные суммы планов, депозиты и долги. Собственные CRM имена/телефоны, текст обращения, интересующие услуги, budget/amount сделки остаются CRM данными. Фильтр применяется после сериализации, включая nested linked inquiries. `/crm/leads/check-phone` требует patients_view; конвертация и запись проверяют фактический переход в HMS и финансовые side effects до обработчика.
- Общий raw `/uploads` mount удалён. `/api/uploads` требует patients_view + patients_export и существующую document запись, проверяет filename/path. Это ужесточение требует проверки старых ссылок/чат-медиа перед deployment.
- У пользователя и staff проверяется clinic_id относительно APP_CLINIC_ID/CONSENT_CLINIC_ID. Legacy база рассматривается как одна клиника; найденные foreign clinic документы в основных коллекциях приводят к fail-closed quarantine до работы бизнес-обработчика.

## Проверки и границы доказательства

- Backend: **726 mock-only теста** прошли после интеграции DID, включая защиту собственного super-admin recovery, вложенных HMS полей и CRM→HMS side effects. Итоговый лог сохраняется в executor `evidence/backend-actions-tests-verified.log`.
- Frontend: **563 тестов** прошли после rebase. Vite production build прошёл; известное предупреждение размера bundle осталось.
- Контракт: все **39** backend enum keys совпали с четырьмя группами frontend.
- Headless browser на отдельном `127.0.0.1:5187`: CRM-only, HMS-only, склад-only, финансы без payroll/с payroll, смешанный набор, пустой набор, форма создания/смены роли/повторного открытия/повторного сохранения/preset/очистки. Внешняя сеть блокируется; API полностью mocked. Сценарий focus refresh с отзывом CRM также прошёл: всего 9 браузерных сценариев.
- Проверены empty/omitted/null, legacy и role-only save, сохранение копии users, тот же JWT после изменения, direct API denial, непривилегированное создание, старшие аккаунты, clinic mismatch/quarantine, отзыв WS доступа, redaction ставок, отсутствие автоматического payroll у super admin.
- Новый target lint проходит для PermissionEditor, permissions, WorkspaceTabs, navigationCatalog по существующей test ESLint конфигурации. Общий `npm run lint` не имеет project ESLint config (и в скопированных node_modules отсутствует `.bin` wrapper); direct eslint подтверждает отсутствие config. Typecheck script/tsconfig отсутствует в JS проекте. Полный DB integration suite не запускался: работа только с синтетикой/mocks.
- Ни один тест не использовал live пациентов. Browser screenshots содержат только Synthetic. Исходный screenshot пользователя не публиковался и не сохранялся повторно в Library; текущая Library identity сохранена рядом с локальными байтами как NTFS metadata.

## Нереализованное и условия до внедрения

1. **MCP release-review blocker.** По прямому ограничению пользователя reporting/MCP и grants не менялись. `reporting/live_access.py` пока объединяет роль с custom_permissions и не читает permission_mode. При существующем finance grant для explicit ограниченного admin/super_admin его эффективные права могут отличаться от UI/JWT. Требуется отдельное согласованное изменение resolver с сохранением scopes, clinic binding и grants; до этого не объявлять единое enforcement для всех способов доступа.
2. **Полноценная tenancy — отдельный проект.** Модель приложения исторически одна DB на клинику, многие запросы/агрегации не tenant-scoped. Quarantine отказывает на известных foreign records, но не заменяет фильтрацию каждой коллекции/join, не решает конкурентные вставки и не доказывает безопасность смешанной multi-tenant DB. Не выкатывать как multi-tenant solution. Нужны отдельные DB либо согласованная миграция clinic_id, индексов, queries, joins, фоновых обработчиков и файлов. Миграции не выполнялись.
3. Публичные raw uploads теперь закрыты; старые URL и previews медиа WhatsApp надо перевести на проверяемые authenticated/signed downloads с clinic/ownership metadata. Совместимость всех исторических файлов не доказана; возвращать публичный mount нельзя.
4. Не все кнопки create/edit/delete/export во всех старых бизнес-формах скрыты по новым ключам. Server отказ обязателен и реализован; полная полировка disabled/hidden UI каждого действия остаётся. Дополнительные старые ограничения роли остаются AND, поэтому разрешение может ещё не открыть отдельную операцию. Точная фактическая API поверхность дана в CSV.
5. Динамические роли, раздельные create/edit для каждой сущности CRM, детальные права этапов/источников/статусов, field-level patient access, исторические ownership ACL и полноценные финансовые CRUD/export не созданы. Отсутствующие/демонстрационные возможности отмечены выше. Payroll нельзя подменить общей галочкой финансов.
6. Provider webhooks `/api/wazzup/webhook/messages` и `/api/telephony/webhook/events` сохранены как внешние входящие интеграции, без JWT-сессии сотрудника. В просмотренном коде полноценная проверка подписи/источника не подтверждена; это отдельный риск подделки входящих событий, требующий provider-specific решения и staging проверки до объявления общего backend безопасным. Исходящий `/api/telephony/callbacks` не является webhook: он закрыт CRM view/edit.
7. Legacy сотрудник из вопроса не исправлен в live: без согласованного адресного пересохранения старый документ сохраняет старую семантику. Без автоматического расширения или массового пересохранения ролей.

## План безопасного внедрения — не выполнялся

1. Review обеих отдельных веток поверх актуальных ref-2/main, согласовать матрицу и перечисленные ужесточения; проверить новые роли DID и consent маршруты. Не смешивать содержимое веток.
2. Перед публикацией разрешить MCP resolver mismatch, историю файлов, аутентификацию provider webhooks и границу клиники; выбрать одну DB на клинику либо отдельную tenancy миграцию. Верифицировать production JWT secret/config без раскрытия секретов.
3. Снять резервную копию, подготовить адресный diff действующих прав **без записи**. Не назначать новые keys ролям пакетно. Согласовать конкретные изменения отдельных сотрудников и payroll с владельцем.
4. На изолированном staging с синтетическими пациентами повторить API/URL/browser матрицу, login/password-change, file downloads, оплату, роли врачей, DID mapping и consent. Проверить существующие role constraints и производительность clinic preflight.
5. Публикацию backend/frontend и любые data changes выполнять только отдельным явным поручением. После выпуска адресно пересохранить одобренного маркетолога в explicit CRM набор, перечитать сессию, проверить 403 HMS API. Существующие права сейчас не менять.
6. Rollback приложения должен учитывать explicit записи: старый backend снова сложит роль с custom_permissions. Нельзя откатывать на старый resolver без сохранения ограничения explicit наборов; заранее подготовить совместимый rollback.

Для повторной инвентаризации есть `tools/export_permission_inventory.py`; он импортирует app без lifespan и не обращается к MongoDB. Использовать собственные synthetic environment values. QA paths и логи находятся в task-3/evidence, browser smoke source — task-3/browser-qa/permission-smoke.mjs.


## Дополнение после повторного review

Продолжение реализации, классификация оставшихся рисков по связи с CRM-only и минимальный безопасный план: [REVIEW-RISKS.md](REVIEW-RISKS.md). Оно уточняет старый список блокеров выше. Добавлены UI action guards, authenticated document downloads и серверные ограничения финансовых побочных действий. PatientModal теперь также затронут; при интеграции сохранить соседние consent refresh/spacing изменения. MCP production resolver и grants не менялись.
