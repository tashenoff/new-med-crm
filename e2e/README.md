# Первый browser E2E: обычная услуга → оплата → зарплата

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

Seed создаёт только одного врача (fixed 1000 KZT за выполнение, consultation
compensation `none`), одну regular-услугу 3000 KZT, внутренний способ оплаты
без платёжного шлюза и одного временного super_admin. Пароль и JWT-ключ случайны
и передаются через временный Compose secret, не через git/CLI/артефакты.
Пользователь истекает через 30 минут; JWT — через 15 минут. Production JWT
проверки и роли используются без bypass. Пациента и план создаёт браузер.

В test entrypoint внешние integration routes возвращают 503, правила
уведомлений отсутствуют. Wazzup получает заведомо тестовую заглушку ключа и
loopback URL; Python audit hook запрещает соединения кроме собственной MongoDB
и loopback readiness. Дополнительно runtime-контейнеры не имеют внешней сети;
браузер блокирует внешние requests, nginx CSP запрещает внешние ресурсы.
Бизнес-API, расчёт зарплаты и записи MongoDB не подменяются.

## Что проверяет браузер

1. API не допускает неавторизованный доступ; вход через реальную форму.
2. Создание синтетического пациента и консультации с одной обычной услугой;
   API создаёт новый план с `full_payment_v1` и стабильными occurrence IDs.
3. До оплаты: MongoDB без accounting events/выполнений; API и UI зарплаты — 0.
4. Через штатный поиск разделов F2 открывается «Зарплата врачей» под уже
   открытой карточкой пациента. Отчёт загружен и смонтирован **до оплаты**.
5. Полная внутренняя UI-оплата 3000 KZT. Отчёт под карточкой автоматически
   обновляется до 1000 KZT; маркер документа сохраняется (нет reload).
6. API и MongoDB: ровно один receipt 3000, одно completion с
   `completion_source=full_payment`, компенсация ровно 1000; услуга/план completed.
7. Две параллельные повторные отправки фактической UI-команды с тем же
   operation_id; новый payment operation_id и повторное completion той же
   occurrence. Ledger целиком остаётся идентичным, зарплата — 1000.
8. После настоящей перезагрузки UI/API/DB сохраняют результат.

Гибриды, комплексы, курсы, анализы и другая зарплатная политика не входят в этап.

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
`evidence.json`, DB/API snapshots до/после оплаты, повторов и reload;
Playwright `trace.zip`, screenshots. При ошибке браузера — `failure.png`,
`failure.html` и название упавшего этапа. При ошибке сборки/readiness браузер ещё
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
читали только scoped checkout paths без дополнительных filesystem entitlements. Docker base images/build cache
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
