#!/usr/bin/env python3
"""
Прямой тест MCP сервера для получения количества пациентов
"""
import subprocess
import json
import sys

def test_mcp_server():
    """Тестируем MCP сервер напрямую"""
    process = None
    try:
        # Запускаем MCP сервер как subprocess
        cmd = [
            "node",
            "C:\\Users\\tester\\Documents\\Cline\\MCP\\mongodb-server\\build\\mongodb-server\\index.js"
        ]

        env = {
            "MONGO_URL": "mongodb://admin:admin123@localhost:27017/?authSource=admin",
            "DB_NAME": "medcrm"
        }

        print("🚀 Запускаем MCP сервер...")
        process = subprocess.Popen(
            cmd,
            env={**subprocess.os.environ, **env},
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Ждем инициализации
        import time
        time.sleep(2)

        # Отправляем запрос на получение списка инструментов
        list_tools_request = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {}
        }

        print("📋 Запрашиваем список инструментов...")
        process.stdin.write(json.dumps(list_tools_request) + "\n")
        process.stdin.flush()

        # Читаем ответ
        response = process.stdout.readline()
        print(f"Ответ: {response}")

        # Отправляем запрос на подсчет пациентов
        count_request = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "execute_query",
                "arguments": {
                    "collection": "patients",
                    "operation": "count"
                }
            }
        }

        print("🔢 Запрашиваем количество пациентов...")
        process.stdin.write(json.dumps(count_request) + "\n")
        process.stdin.flush()

        # Читаем ответ
        response = process.stdout.readline()
        print(f"Ответ: {response}")

        # Завершаем процесс
        process.terminate()
        process.wait()

    except Exception as e:
        print(f"❌ Ошибка: {e}")
        if process:
            process.terminate()
            process.wait()
        return False

    return True

if __name__ == "__main__":
    test_mcp_server()
