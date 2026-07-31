# Скрипт для запуска Apache Superset
# Использование: .\start_superset.ps1

Write-Host "=== Запуск Apache Superset ===" -ForegroundColor Green

# Переход в папку Superset
Set-Location -Path "E:\new-med-crm\Superset"

# Активация виртуального окружения
Write-Host "`nАктивация виртуального окружения..." -ForegroundColor Yellow
& ".\venv\Scripts\Activate.ps1"

# Установка переменной окружения
Write-Host "Настройка конфигурации..." -ForegroundColor Yellow
$env:SUPERSET_CONFIG_PATH = "E:\new-med-crm\Superset\superset_config.py"

# Запуск Superset
Write-Host "`nЗапуск Superset на http://localhost:8088 ..." -ForegroundColor Yellow
Write-Host "Для остановки нажмите Ctrl+C" -ForegroundColor Cyan

superset run -p 8088 --with-threads --reload --debugger
