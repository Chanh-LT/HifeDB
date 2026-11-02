# HifeDB - Hệ Quản Trị Cơ Sở Dữ Liệu Phân Tán (Custom Document DBMS)

## 1. Giới thiệu dự án
HifeDB là hệ quản trị cơ sở dữ liệu Document NoSQL phân tán được tự xây dựng và phát triển độc lập (mô phỏng kiến trúc MongoDB Sharded Cluster), không phụ thuộc vào hệ CSDL bên ngoài:
- **Storage Engine**: B+ Tree ACID với LMDB, tài liệu tuần tự hóa nhị phân bằng MessagePack (tương đương BSON).
- **Hỗ trợ Index**: Lập mục lục B+ Tree thứ cấp trên các trường để tăng tốc tìm kiếm.
- **Query Engine**: Hỗ trợ bộ lọc JSON filter mạnh mẽ với các toán tử `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$exists`, `$regex`.
- **Distributed Sharding**:
  - **Router Gateway (tương đương `mongos`)** tại cổng `8000`: Phân phối tài liệu thông qua **Consistent Hash Ring with Virtual Nodes (150 vnodes/shard)**.
  - **Shard Nodes (tương đương `mongod`)** tại cổng `8001`, `8002`: Các nút lưu trữ dữ liệu độc lập.
  - **Scatter-Gather Engine**: Quét và gom dữ liệu song song trên toàn bộ cụm khi truy vấn.
- **AI Query Engine**: Tự động chuyển đổi ngôn ngữ tự nhiên (tiếng Việt & tiếng Anh) thành truy vấn JSON filter và thực thi Scatter-Gather.
- **Web Dashboard**: Frontend React + Vite giao diện cao cấp quản lý Database, Collection, Document, Index, Query Editor và trực quan hóa Vòng băm nhất quán (Consistent Hash Ring).

---

## 2. Yêu cầu môi trường
- Python >= 3.10
- Node.js & npm
- Docker (tùy chọn)

---

## 3. Hướng dẫn khởi động nhanh (Local)

### Bước 1: Khởi động toàn bộ Cụm CSDL HifeDB (Shard 1, Shard 2, Router Gateway)
Nhấp đúp chuột vào file:
```
scripts/start-cluster-local.bat
```
hoặc chạy qua PowerShell:
```powershell
.\scripts\start-cluster-local.ps1
```
Khi đó:
- **Shard 1 Node**: `http://127.0.0.1:8001`
- **Shard 2 Node**: `http://127.0.0.1:8002`
- **Router Gateway**: `http://127.0.0.1:8000`

### Bước 2: Khởi động Dashboard Quản Lý (Frontend)
Mở một terminal mới:
```bash
cd frontend
npm install
npm run dev
```
Truy cập giao diện tại: `http://localhost:5173`

---

## 4. Các Endpoint API chính trên Router Gateway (Port 8000)
- `GET /api/health`: Kiểm tra trạng thái Router và số Shard kết nối.
- `GET /api/replication-status` hoặc `/cluster/status`: Giám sát sức khỏe, latency, dung lượng của từng Shard Node.
- `GET /api/databases`: Danh sách database và tổng số document trên toàn cụm.
- `POST /api/databases`: Tạo database mới.
- `GET /api/databases/{name}/collections`: Danh sách collections của database.
- `POST /api/databases/{name}/collections`: Tạo collection mới.
- `POST /api/v1/{collection}/insert`: Chèn document mới (tự động băm `_id` qua Consistent Hash Ring và điều hướng về Shard phụ trách).
- `GET /api/v1/{collection}/{doc_id}`: Lấy document theo `_id`.
- `PUT /api/v1/{collection}/{doc_id}`: Cập nhật document.
- `DELETE /api/v1/{collection}/{doc_id}`: Xóa document.
- `GET /api/v1/{collection}/documents`: Quét và tổng hợp tài liệu từ tất cả Shards (Scatter-Gather).
- `POST /api/v1/{collection}/query`: Thực thi truy vấn JSON filter phân tán.
- `POST /api/ai/generate`: Sinh câu truy vấn JSON filter bằng AI.
- `POST /api/ai/execute`: Thực thi truy vấn AI trên toàn cụm Shards.
