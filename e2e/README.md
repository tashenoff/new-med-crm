# Browser E2E: обычные услуги, комплекс и отдельный анализ

Из корня репозитория на Linux/macOS или в облачной Linux-среде с Git,
Python 3.10+ и Docker Engine/Compose v2 (BuildKit):

```sh
python3 e2e/run.py
```

Нужны доступ к этому git remote, Docker Hub, npm, PyPI и Debian **для сборки**.
Локальные Node, Python-пакеты, MongoDB, `.env` и секреты CRM не нужны.
Оставьте достаточно места для сборки и Chromium: с Docker VFS слои занимают
существенно больше места; повторные сборки на диске 32 GB могут заполнить кеш.
Глобальный Docker cache других проектов команда автоматически не чистит.
Запуск не публикует порты и не предоставляет постоянный стенд/логин.
Для локальной машины подходит Docker Desktop; отдельно эта платформа не проверена.
Remote Docker daemon с другой
файловой системой не поддерживается (Compose монтирует harness и ephemeral secret).

## Что запускается

Команда fetch-ит `main` и `ref-2`, фиксирует полные SHA, создаёт detached git
worktrees и собирает настоящий frontend из `main` и API из `ref-2`.
Исходники приложения не скопированы в тестовую реализацию. Тестовый код живёт
только в `e2e/`; production workflows и auth не меняются.

У каждого запуска уникальный Compose project и сеть `internal: true`.
MongoDB 7 — отдельный контейнер с tmpfs, без опубликованного порта и постоянного
volume. `seed.py` принимает только `mongodb://mongo:27017` и
`medcrm_browser_e2e`; сбрасывает только эту базу в этом проекте. Стандартные
backend pytest-фикстуры, читающие dev `.env` и локальную MongoDB, не вызываются.
Frontend использует same-origin `/api`, nginx проксирует его на тестовый API.
Браузер разделяет network namespace только с web-контейнером и открывает
`http://localhost`: это штатный secure context для Web Crypto, без TLS bypass
и без host networking в runtime.
Образы не включают `.env`, uploads, пользовательские данные и credentials.

Seed создаёт двух совместимых врачей: fixed 1000 KZT и hybrid 1000 KZT + 10%,
consultation compensation `none`. Гибрид использует канонический `payment_value=1000`,
а не устаревший `hybrid_fixed_amount`. Обычная услуга стоит 3000 KZT;
комплекс — 5000 KZT с двумя компонентами 2000 и 3000 KZT. У каждого компонента
свой единственный совместимый врач и валидное расписание 09:00–18:00 все семь дней.
Seed использует production write-model validators и проверку состава комплекса
из ServicePriceService. UI получает настоящую specialist availability и выбирает
валидные свободные слоты; validation/availability не обходятся.

Также создаётся активная синтетическая лаборатория без контактов/интеграции и её
regular-анализ 2500 KZT с laboratory_id, без привязки к врачу. Используются модели
LaboratoryCreate и ServicePriceCreate. Внутренний способ оплаты — без шлюза;
super_admin временный.
Пароль и JWT-ключ случайны и передаются через временный Compose secret,
не через git/CLI/артефакты. Пользователь истекает через 30 минут; JWT — через
15 минут. Production JWT проверки и роли используются без bypass.
Пациента, консультацию и план создаёт браузер. Перед первыми четырьмя сценариями база
детерминированно сбрасывается тем же seed; Mongo/API/frontend стек общий. Пятый
сценарий анализа сохраняет оплаченный через UI комплекс четвёртого сценария:
так проверяется неизменность уже ненулевых зарплат 1000/1300. Внутри отдельного
счёта анализа остаётся ровно одна услуга без врача, у нового синтетического пациента.

В test entrypoint внешние integration routes возвращают 503, правила
уведомлений отсутствуют. Wazzup получает заведомо тестовую заглушку ключа и
loopback URL; Python audit hook запрещает соединения кроме собственной MongoDB
и loopback readiness. Дополнительно runtime-контейнеры не имеют внешней сети;
браузер блокирует внешние requests, nginx CSP запрещает внешние ресурсы.
Бизнес-API, расчёт зарплаты и записи MongoDB не подменяются.

## Ровно пять сценариев

| Сценарий | UI-оплата | Точная зарплата fixed / hybrid |
| --- | --- | --- |
| ordinary-fixed | Обычная услуга 3000 | 1000 / 0 |
| ordinary-hybrid | Обычная услуга 3000 | 0 / 1300 |
| complex-components | Сначала fixed-компонент 2000; затем остаток 3000 | сначала 1000 / 0; затем 1000 / 1300 |
| complex-full | Свежий комплекс целиком 5000 | 1000 / 1300 |
| lab-analysis | Отдельный анализ 2500 без врача | прежние 1000 / 1300, анализ добавляет 0 |

В каждом случае:

1. Реальный API отказывает без авторизации; вход, создание пациента/плана и оплата — через UI.
2. Новый план имеет `full_payment_v1`, стабильные row/component/occurrence IDs.
   До оплаты нового счёта ledger пуст. В первых четырёх сценариях зарплаты — 0;
   в лабораторном прежние зарплаты 1000/1300 остаются неизменными.
3. «Зарплата врачей» смонтирована под карточкой пациента до оплаты.
   После оплаты значения меняются автоматически; маркер документа доказывает отсутствие reload.
4. Mongo и API совпадают по services, accounting_events, payment/execution status.
   Каждый оплаченный target имеет ровно receipt + completion. Для врачебных услуг
   fixed-часть — 1000, hybrid receipt добавляет ровно 300. У анализа оба события
   имеют doctor_id=null и компенсацию 0; server-verified catalog snapshot содержит
   laboratory_id и нулевой percentage tariff. Проверяются doctor IDs,
   суммы, component/occurrence IDs и `completion_source=full_payment`.
5. Два параллельных повтора фактической UI-команды возвращают 200/200;
   новый payment operation отвергается (aggregate 409, component 422),
   повторное completion — 409. Весь ledger и service projections остаются идентичными.
6. После настоящего reload сохраняются точные UI/API/Mongo результаты.

В `complex-components` эти проверки выполняются **после каждой из двух оплат**,
включая reload после первой. До второй оплаты hybrid-компонент остаётся
неоплаченным/невыполненным, его врач имеет 0; fixed получает 1000 сразу.
Оплата остатка сохраняет первые ledger events без изменений и завершает второй
компонент. В `complex-full` оба врача получают свои точные суммы раздельно.

В `lab-analysis` выбор и создание счёта проходят через вкладку «Анализы», оплата —
через штатную карточку плана. Проверяются paid, автоматические completed и
quantity_completed=1, отсутствие врача/назначенных приёмов, нулевые начисления,
ответы Finance 200 без accounting blockers. Полный прежний оплаченный план,
его ledger и зарплаты 1000/1300 сохраняются до/после оплаты, повторов и reload.
В этой модели completed означает выполнение услуги в учёте оплаты. Отдельного
статуса готовности лабораторного результата у этой строки нет; тест его не выдумывает.

Это ограниченный пакет из пяти сценариев, не полное покрытие. Анализ внутри
комплекса, курсы и частичная денежная оплата отдельной услуги не проверяются.
Зарплатная политика приложения не меняется; обнаруженный бизнес-баг требует
отдельного решения, тест не подгоняется под результат.

## Candidate revisions и воспроизведение

По умолчанию проверяются **свежие fetched refs**, не встроенные старые SHA.
Для локального frontend-кандидата (предварительно локально закоммиченного):

```sh
python3 e2e/run.py --frontend-ref HEAD
```

Для backend-кандидата из ветки, основанной на `ref-2`:

```sh
python3 e2e/run.py --backend-ref HEAD
```

Можно передать два конкретных SHA и `--no-fetch` для воспроизведения имеющихся
objects. Проверяется commit каждого источника: незакоммиченные изменения
приложения в исходном checkout не попадают в сборку. Сам harness запускается
из текущего checkout; SHA256 каждого его файла записывается в `run.json`.

Workflow `.github/workflows/browser-e2e.yml` запускается на обычный
`pull_request` в main/ref-2: `github.sha` (candidate merge revision) заменяет
соответственно frontend/backend; вторая сторона берётся из fetched counterpart
ветки. `checkout` с `fetch-depth: 0` сначала получает refs и удаляет credentials;
поэтому CI вызывает ту же команду с `--no-fetch`. Для workflow_dispatch выберите,
какой стороне соответствует выбранная workflow revision: frontend, backend или
released_pair. PR из fork не получает секретов. `pull_request_target` не используется;
permissions только `contents: read`. Production deployment workflow не затрагивается.
Для автоматических будущих PR в обе ветки harness/workflow нужно принять в обе
ветки. Подготовлена отдельная тестовая ветка на базе main с draft PR. Это не переносит
workflow в ref-2 автоматически: такой перенос требует отдельного PR без изменения
production deploy workflow и без прямого push в ref-2.

## Evidence и cleanup

`e2e-artifacts/<UTC-run-id>/run.json` содержит точную пару SHA, hash harness,
status/error, image IDs, подтверждение internal network/no host ports и cleanup.
В том же каталоге: backend dependency versions, runner/stack/browser logs,
`<scenario>-evidence.json`, DB/API snapshots до/после каждой оплаты, повторов
и reload; отдельные Playwright `<scenario>-trace.zip` и screenshots. При ошибке браузера — `<scenario>-failure.png`,
`<scenario>-failure.html` и название упавшего этапа. При ошибке сборки/readiness браузер ещё
не запущен: доступны runner/stack logs и понятная ошибка, screenshot/trace нет.
Перед завершением scrubber удаляет пароль, JWT-ключ и JWT, включая binary
resources и содержимое trace ZIP. Затем проверяет отсутствие credentials,
целостность ZIP и атомарно создаёт `published/` с SHA256 manifest `SANITIZED.json`.
CI загружает **только** `e2e-artifacts/*/published/`, даже после обычного падения,
retention 7 дней. При отмене/ошибке scrubber необработанные файлы не загружаются.
Артефакты не коммитятся.

`finally` удаляет контейнеры, сеть, volumes, project images, worktrees и временный
secret, включая SIGINT/SIGTERM и обычные ошибки. Временные файлы и worktrees
создаются в private `e2e/.runtime-*/` (gitignored), чтобы новые Buildx/Bake
читали только scoped checkout paths без дополнительных filesystem entitlements.
API получает только четыре отдельных read-only helper mounts; приватный каталог
с worktrees/secret никогда не монтируется внутрь контейнеров целиком. Docker base images/build cache
может остаться для следующей сборки; в них нет runtime credentials или данных БД.
При SIGKILL/падении Docker/машины cleanup может не выполниться. Project name
записан в `run.json`; аварийный cleanup не затрагивает другие проекты:

```sh
docker ps -aq --filter label=com.docker.compose.project=PROJECT_FROM_RUN_JSON | xargs -r docker rm -f -v
docker network rm PROJECT_FROM_RUN_JSON_isolated
```

Для proxy/TLS-inspection сборки поддерживаются стандартные HTTP_PROXY/HTTPS_PROXY
и необязательные `E2E_BUILD_CA=/path/to/public-ca.crt`, `E2E_BUILD_NETWORK=host`.
В managed Codex окружении публичный CA берётся из CODEX_PROXY_CERT; proxy hostname
разрешается в build extra_hosts. CA — BuildKit secret только для скачивания
пакетов; proxy и CA не передаются runtime CRM. TLS verification не отключается.

Проверки harness без Docker: `python3 -m unittest discover -s e2e -p 'test_*.py'`.
Локальный PASS не является подтверждением GitHub Actions; фактический run и его
точная пара SHA проверяются отдельно после публикации тестовой ветки.
