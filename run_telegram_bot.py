#!/usr/bin/env python3
"""
Скрипт для запуска Telegram бота Medical CRM
"""
import sys
import os

# Добавляем backend в путь
backend_path = os.path.join(os.path.dirname(__file__), 'backend')
sys.path.insert(0, backend_path)

from backend.telegram_bot.bot import run_bot

if __name__ == '__main__':
    print("=" * 50)
    print("Medical CRM Telegram Bot")
    print("=" * 50)
    print("Запуск бота...")
    print()
    
    try:
        run_bot()
    except KeyboardInterrupt:
        print("\n\nОстановка бота...")
        print("Бот успешно остановлен.")
    except Exception as e:
        print(f"\n\nОшибка при запуске бота: {e}")
        sys.exit(1)
