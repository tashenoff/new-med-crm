# Пакет из четырёх browser E2E — 2026-10-16

Локальный полный запуск **4/4 PASS**, `20261016T003457Z-5547a4de`,
завершён `2026-10-16T00:36:50.811508+00:00` в выбранном облачном Docker workspace.
Команда: `python3 e2e/run.py --frontend-ref HEAD`.

| Источник | Точный SHA |
| --- | --- |
| frontend, HEAD тестовой ветки при прогоне | `662507c7259d5f87ed061647bd00020594043ecc` |
| backend, fetched ref-2 | `3101bf1bc1ef5a9bcfe888b213416173d19a8afd` |
| фактический released main | `6b5fe391b33bbe3c5e4bf791de47ea1337389c1c` |

Harness запускается из текущего checkout: этот прогон включает новые ещё
незакоммиченные test-файлы, SHA256 каждого записан в run.json. Приложение берётся
из точных immutable source commits; frontend/backend business-код не изменён.

| Сценарий | До оплаты fixed / hybrid | После UI-оплаты fixed / hybrid | Ledger |
| --- | --- | --- | --- |
| ordinary-fixed, 3000 KZT | 0 / 0 | 1000 / 0 | 2 events |
| ordinary-hybrid, 3000 KZT | 0 / 0 | 0 / 1300 | 2 events |
| complex-components, 2000 затем 3000 | 0 / 0 | 1000 / 0 → 1000 / 1300 | 2 → 4 events |
| complex-full, свежий план 5000 | 0 / 0 | 1000 / 1300 | 4 events |

Каждый стартует с чистой собственной БД при общем временном стеке. Для каждой
оплаты подтверждены live Finance без document reload, точные UI/API/Mongo
суммы, статусы, earning doctor и стабильные component/occurrence IDs.
Уплаченный компонент завершён сразу; неоплаченный компонент не завершён и его
врач ничего не получает. После оплаты остатка первые два events идентичны.
Во всех сценариях receipt + completion сверены по отдельности: hybrid =
300 за receipt + 1000 за completion; fixed = 0 + 1000.

После **каждой** оплаты проверены параллельные повторы исходной UI-команды
(200/200), новая операция оплаты (component 422; aggregate 409), повторное
completion каждой оплаченной occurrence (409). Весь ledger и service projections
идентичны до/после повторов. Настоящий reload сохраняет точные результаты,
включая промежуточное состояние комплекса после первой оплаты.

При сравнении API и Mongo дата нормализуется к одному UTC-моменту:
FastAPI отдаёт naive UTC с microseconds, Mongo BSON Date — UTC с milliseconds.
Это единственная нормализация; суммы/статусы/врачи/identities не исключены из проверки.

Самостоятельное ревью: область reset и egress guards сохранены; используются
DoctorCreate/DoctorScheduleCreate/ServicePriceCreate и production validation
состава комплекса. Не используются deprecated hybrid aliases, нулевые цены,
бизнес-моки или обход совместимости/расписания. Селекторы расписания ограничены
его панелью; browser viewport 1920×1200 позволяет видеть полные зарплатные строки.
Screenshots комплекса после первой и полной оплаты просмотрены визуально.
Бизнес-багов в этих четырёх сценариях не найдено. Application/deploy diff пуст.

Четыре security unit-теста, Python compile, Node syntax и diff whitespace — PASS.
Все 45 файлов manifest проверены по SHA256; 550 файлов/ZIP entries проверены
на JWT; все четыре trace ZIP целы. Cleanup подтверждён runner и независимым
Docker label lookup; временные worktrees/secret удалены. Опубликованный локальный
bundle: `e2e-artifacts/20261016T003457Z-5547a4de/published/` (не коммитится).

Предварительные падения были в fixture validation, сериализации дат и UI selector;
их screenshot/trace/logs сохранены там, где браузер успел запуститься. Assertions
бизнес-результатов не ослаблялись, production-файлы не исправлялись.

CI этого расширенного пакета проверяется после публикации того же draft PR #2.
Следующие непокрытые сценарии: курсы, частичная денежная оплата отдельной услуги,
лабораторные анализы. Это **четыре сценария**, не полное покрытие CRM.

---

Ниже исторический отчёт первого этапа до публикации; его упоминания ещё
не запущенного CI относятся только к тому моменту. Для первого этапа затем
получен [GitHub Actions PASS](https://github.com/tashenoff/new-med-crm/actions/runs/38828872877).

# Проверка первого этапа — 2026-10-16

**Результат: локальный Docker/browser прогон PASS в выбранном облачном workspace.**
GitHub Actions фактически не запускался: изменения не опубликованы.

Команда: `python3 e2e/run.py`.
Прогон `20261016T000026Z-9b29e7e6`, завершён `2026-10-16T00:02:07.731233+00:00`.
Chromium `155.0.8059.39`, Playwright `1.56.1`, disposable MongoDB `7.0.16`.

| Источник | Точный SHA |
| --- | --- |
| frontend, фактический main | `6b5fe391b33bbe3c5e4bf791de47ea1337389c1c` |
| backend, фактический ref-2 | `3101bf1bc1ef5a9bcfe888b213416173d19a8afd` |

`main` продвинулся относительно ранее подтверждённого `f499a242…`.
Перед прогоном выполнен fetch обеих веток; после прогона `ls-remote` подтвердил
ту же пару. Каждый пробный/упавший запуск тоже сохранял свои полные source SHA
в собственном `run.json`; прежняя пара не встроена в код теста.

## Подтверждённые результаты настоящего UI/API/DB

Вход через UI, создание синтетического пациента, консультации и нового плана
с одной regular-услугой 3000 KZT у врача fixed 1000 KZT выполнены браузером.

| Состояние | Оплачено | Выполнения / accounting events | Зарплата |
| --- | ---: | --- | ---: |
| До оплаты | 0 | 0 / 0 | 0 |
| После полной внутренней UI-оплаты | 3000 | 1 / 2 (receipt + completion) | 1000 |
| После повторов | 3000 | 1 / те же 2 events, без изменений | 1000 |
| После reload | 3000 | 1 / 2 | 1000 |

Отчёт зарплаты смонтирован до оплаты под открытой карточкой пациента;
после оплаты изменился автоматически. Маркер текущего документа сохранился.
После закрытия карточки видимый отчёт также показал 1000. После настоящего
reload результат сохранился. Screenshot обоих состояний визуально просмотрен.

Повторы реальных business API команд, без моков:

- две параллельные копии захваченной UI-команды с исходным operation_id: `200`, `200`;
- та же оплата с новым operation_id: `409`;
- попытка повторить completion той же occurrence с новым operation_id: `409`;
- MongoDB ledger целиком идентичен состоянию до повторов; компенсация ровно 1000.

## Изоляция, evidence и cleanup

- У Mongo/API/nginx при inspect подтверждены только internal network и отсутствие
  опубликованных портов. Browser разделяет только сеть web-контейнера.
- Python audit hook на реальном runtime блокирует внешнее socket-соединение
  до отправки; guard отвергает другой Mongo URL и другое имя базы.
- Реальный API отвергает неавторизованный доступ; Wazzup endpoint возвращает 503
  до handler. Notification rules и Wazzup messages в тестовой DB отсутствуют.
- Неперехваченных browser errors нет. Пароли/JWT-ключи случайны, в git не записаны;
  test user/password expiry и JWT проверяются штатным production-кодом auth.
- `trace.zip` корректно открывается; 122 файла/zip entries реального прогона
  проверены на оставшиеся JWT: не обнаружены. Unit-тест scrubber дополнительно
  проверяет удаление password, signing key и JWT внутри/вне trace ZIP и сохранность
  бинарного ресурса.
- `compose down --volumes --remove-orphans --rmi local` выполнен успешно.
  Отдельный Docker label lookup подтвердил отсутствие контейнеров, сетей и volumes
  проекта `medcrm-e2e-8d18334c8ffc`. Временные worktrees/secret удалены;
  `git worktree list` содержит только исходный checkout.

Evidence сохранено локально в `e2e-artifacts/20261016T000026Z-9b29e7e6/`:
`run.json`, `evidence.json`, `before-payment.json`, `after-payment.json`,
`after-repeat.json`, `after-reload.json`, `finance-live.png`,
`finance-reloaded.png`, `trace.zip`, runner/stack/browser logs,
`backend-dependencies.txt`. Каталог игнорируется Git. В предыдущих UI-падениях
подтверждено сохранение `failure.png`, HTML, trace и журналов.

## Самостоятельное ревью изменений

Проверены источник каждой стороны, отсутствие production-конфигурации в build
contexts, runtime egress, auth без bypass, область reset, повторяемость ledger,
cleanup на ошибках, redaction и CI permissions. Исправлены найденные проблемы
стенда: secure context для Web Crypto через loopback, неоднозначные UI-селекторы,
сохранение исходной ошибки при сбое сбора evidence, обязательный cleanup при
ошибке сбора и запрет PASS при потере browser evidence. Business-код не менялся.

В этом окружении Microsoft registry отклонял официальный Playwright image;
использован Chromium из Debian с тем же Playwright. Docker VFS cache повторных
сборок заполнил диск; созданный при работе build cache был очищен, scenario
переведён в read-only mount, затем полный прогон завершился PASS. Условия сборки
и требования к месту описаны в README.

После рабочего прогона завершено ревью CI: actions закреплены проверенными
commit SHA, YAML парсится, bash selection проверен для PR в main/ref-2 и трёх
workflow_dispatch вариантов. Candidate merge revision подставляется в нужную
сторону; неизвестная целевая ветка отвергается. Token permissions — contents:read,
checkout удаляет credentials после fetch. `pull_request_target` отсутствует.

Пройдены: Python unittest scrubber, Python compile, Node syntax, YAML parse,
Compose safety config assertions, CI selection probes, `git diff --check`.
Подтверждён пустой diff для frontend, backend и production deploy workflow.
Блокирующих замечаний в просмотренных изменениях не осталось.

Для обеих веток подготовлены переносимые patches в `e2e-artifacts/delivery/`:
`browser-e2e-main.patch` и `browser-e2e-ref-2.patch`. Каждый patch проверен
`git apply --check` и применением в временном detached worktree соответствующего
точного SHA. Все файлы harness/workflow совпадают с подготовленным checkout;
каждая версия `.gitignore` сохраняет прежние правила своей ветки. После проверки
эти worktrees удалены. Это подготовленные локальные изменения, без remote push.

## Что остаётся непроверенным / требует следующего согласованного шага

- Фактический GitHub Actions run, включая hosted runner и upload-artifact.
  Локальные проверки YAML/bash не заменяют запуск CI.
- Установка harness/workflow в обе remote ветки и реальные PR revisions:
  подготовлен main-based checkout; для автоматических будущих PR в ref-2 тот же
  harness/workflow должен быть отдельно принят в ref-2. Публикация/PR не выполнялись.
- Docker Desktop и другие машины отдельно не проверены.
- Гибриды, комплексы, курсы, анализы и остальные browser-сценарии вне этого этапа.

Remote push, PR, production deploy, изменение repository permissions и branch
protection не выполнялись. Зарплатная политика и production auth не менялись.


## Повторная проверка перед публикацией тестовой ветки

Второй чистый полный прогон `20261016T001034Z-14854395` — **PASS** на той же
точной паре `6b5fe391b33bbe3c5e4bf791de47ea1337389c1c` +
`3101bf1bc1ef5a9bcfe888b213416173d19a8afd`. UI/API/DB снова подтвердили
зарплату 0 → 1000, live update, неизменный ledger после повторов 200/200 и
409/409, сохранение после reload. Cleanup проверен автоматически по Docker labels.

Сфокусированное ревью перед CI добавило отказ от auth fallback в test entrypoint,
проверку удаления временных worktrees и Docker resources, scrub binary resources
и fail-closed публикацию artifacts только после полного сканирования. Все 13
файлов опубликованного локального bundle проверены по SHA256 manifest; trace ZIP
цел и JWT отсутствуют. Четыре unit-теста проверяют обычный scrub, binary resource,
ошибку чтения и повреждённый trace: при сбое директория upload не появляется.

В remote main и ref-2 единственный прежний Actions workflow запускает production
только на push в ref-2. Публикация новой `test/disposable-browser-e2e` и draft PR
в main не соответствует этому trigger. Workflow, настройки репозитория и deploy
конфигурация не меняются.

Продвижение main от f499a24 сохранено: 940acf72d9834df4e39a3a236cdbf00e0874d5fd
исправляет отображение карточек календаря, 6b5fe391b33bbe3c5e4bf791de47ea1337389c1c
добавляет подробную историю первого обращения. Тестовая ветка сохраняет их
как предков; diff затрагивает только e2e, отдельный workflow и .gitignore.

Этот раздел фиксирует проверку **до публикации**. Фактический результат GitHub
Actions и ссылки на ветку/PR/run сообщаются отдельно после его завершения.
