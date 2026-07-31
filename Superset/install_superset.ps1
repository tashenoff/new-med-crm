# Скрипт установки Apache Superset
# Использование: .\install_superset.ps1

Write-Host "=== Установка Apache Superset ===" -ForegroundColor Green
Write-Host "Этот процесс может занять 10-15 минут`n" -ForegroundColor Yellow

# Переход в папку Superset
Set-Location -Path "E:\new-med-crm\Superset"

# Проверка наличия виртуального окружения
if (-Not (Test-Path ".\venv")) {
    Write-Host "Создание виртуального окружения..." -ForegroundColor Yellow
    python -m venv venv
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Ошибка при создании виртуального окружения!" -ForegroundColor Red
        exit 1
    }
}

# Активация виртуального окружения
Write-Host "Активация виртуального окружения..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Обновление pip
Write-Host "`nОбновление pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip

# Установка зависимостей
Write-Host "`nУстановка Apache Superset и зависимостей..." -ForegroundColor Yellow
Write-Host "Это может занять некоторое время. Пожалуйста, подождите..." -ForegroundColor Cyan
pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nОшибка при установке зависимостей!" -ForegroundColor Red
    Write-Host "Попробуйте установить вручную: pip install apache-superset pymongo psycopg2-binary" -ForegroundColor Yellow
    exit 1
}

# Установка переменной окружения
Write-Host "`nНастройка конфигурации..." -ForegroundColor Yellow
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"

# Инициализация базы данных
Write-Host "`nИнициализация базы данных Superset..." -ForegroundColor Yellow
superset db upgrade

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nОшибка при инициализации базы данных!" -ForegroundColor Red
    exit 1
}

# Создание администратора
Write-Host "`n=== Создание учетной записи администратора ===" -ForegroundColor Green
Write-Host "Введите данные для администратора Superset:`n" -ForegroundColor Yellow
superset fab create-admin

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nОшибка при создании администратора!" -ForegroundColor Red
    exit 1
}

# Инициализация Superset
Write-Host "`nИнициализация Superset (создание ролей и прав)..." -ForegroundColor Yellow
superset init

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nОшибка при инициализации Superset!" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Установка завершена успешно! ===" -ForegroundColor Green
Write-Host "`nДля запуска Superset используйте:" -ForegroundColor Cyan
Write-Host ".\start_superset.ps1" -ForegroundColor White
Write-Host "`nили запустите вручную:" -ForegroundColor Cyan
Write-Host "cd E:\new-med-crm\Superset" -ForegroundColor White
Write-Host ".\venv\Scripts\Activate.ps1" -ForegroundColor White
Write-Host "`$env:SUPERSET_CONFIG_PATH = 'E:\new-med-crm\Superset\superset_config.py'" -ForegroundColor White
Write-Host "superset run -p 8088 --with-threads --reload --debugger" -ForegroundColor White
Write-Host "`nПосле запуска откройте: http://localhost:8088" -ForegroundColor Green
