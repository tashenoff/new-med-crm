@echo off
title Medical CRM - Backend (port 8001)
cd /d "E:\new-med-crm\backend"
echo Starting backend API server...
echo URL: http://localhost:8001/docs
echo Press Ctrl+C to stop.
"E:\new-med-crm\backend\venv\Scripts\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8001
pause