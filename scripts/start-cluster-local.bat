@echo off
chcp 65001 >nul
title HifeDB Cluster Launcher
echo ========================================================
echo       KHOI DONG HE QUAN TRI CSDL PHAN TAN HIFEDB
echo ========================================================
echo.

set PYTHONPATH=./backend
set PYTHONIOENCODING=utf-8

echo [1/3] Khoi dong Shard 1 (Port 8001)...
start "HifeDB Shard 1 (8001)" cmd /k "set NODE_ID=shard-1& set PORT=8001& set HOST=127.0.0.1& set DB_PATH=./data/shard1_db& set PYTHONPATH=./backend& python -m uvicorn shard.server:app --host 127.0.0.1 --port 8001 --app-dir ./backend"

timeout /t 2 /nobreak >nul

echo [2/3] Khoi dong Shard 2 (Port 8002)...
start "HifeDB Shard 2 (8002)" cmd /k "set NODE_ID=shard-2& set PORT=8002& set HOST=127.0.0.1& set DB_PATH=./data/shard2_db& set PYTHONPATH=./backend& python -m uvicorn shard.server:app --host 127.0.0.1 --port 8002 --app-dir ./backend"

timeout /t 2 /nobreak >nul

echo [3/3] Khoi dong Router Gateway (Port 8000)...
start "HifeDB Router Gateway (8000)" cmd /k "set ROUTER_HOST=127.0.0.1& set ROUTER_PORT=8000& set SHARD_NODES=http://127.0.0.1:8001,http://127.0.0.1:8002& set PYTHONPATH=./backend& python -m uvicorn router.server:app --host 127.0.0.1 --port 8000 --app-dir ./backend"

echo.
echo ========================================================
echo   CUM HIFEDB DA SAN SANG!
echo   - Router Gateway: http://127.0.0.1:8000
echo   - Shard 1 Node  : http://127.0.0.1:8001
echo   - Shard 2 Node  : http://127.0.0.1:8002
echo.
echo   De mo Dashboard:
echo   Mo terminal: cd frontend ^&^& npm run dev
echo ========================================================
