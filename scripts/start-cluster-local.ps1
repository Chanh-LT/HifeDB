# scripts/start-cluster-local.ps1
$OutputEncoding = [System.Text.Encoding]::UTF8
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      KHỞI ĐỘNG HỆ QUẢN TRỊ CSDL PHÂN TÁN HIFEDB       " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$env:PYTHONPATH = "./backend"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "`n[1/3] Đang khởi động Shard 1 (Port 8001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:NODE_ID='shard-1'; `$env:PORT='8001'; `$env:HOST='127.0.0.1'; `$env:DB_PATH='./data/shard1_db'; `$env:PYTHONPATH='./backend'; python -m uvicorn shard.server:app --host 127.0.0.1 --port 8001 --app-dir ./backend"

Start-Sleep -Seconds 2

Write-Host "[2/3] Đang khởi động Shard 2 (Port 8002)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:NODE_ID='shard-2'; `$env:PORT='8002'; `$env:HOST='127.0.0.1'; `$env:DB_PATH='./data/shard2_db'; `$env:PYTHONPATH='./backend'; python -m uvicorn shard.server:app --host 127.0.0.1 --port 8002 --app-dir ./backend"

Start-Sleep -Seconds 2

Write-Host "[3/3] Đang khởi động Router Gateway (Port 8000)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$env:ROUTER_HOST='127.0.0.1'; `$env:ROUTER_PORT='8000'; `$env:SHARD_NODES='http://127.0.0.1:8001,http://127.0.0.1:8002'; `$env:PYTHONPATH='./backend'; python -m uvicorn router.server:app --host 127.0.0.1 --port 8000 --app-dir ./backend"

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  CỤM HIFEDB ĐÃ SẴN SÀNG!" -ForegroundColor Green
Write-Host "  - Router Gateway: http://127.0.0.1:8000"
Write-Host "  - Shard 1 Node  : http://127.0.0.1:8001"
Write-Host "  - Shard 2 Node  : http://127.0.0.1:8002"
Write-Host "`n  Để mở giao diện quản lý (Dashboard):"
Write-Host "  Mở terminal: cd frontend; npm run dev"
Write-Host "========================================================`n" -ForegroundColor Green
