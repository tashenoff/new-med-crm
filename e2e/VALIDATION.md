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
