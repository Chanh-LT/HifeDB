# HifeDB - Hệ Quản Trị Cơ Sở Dữ Liệu Phân Tán (Custom Document DBMS)

HifeDB là hệ quản trị cơ sở dữ liệu Document NoSQL tự phát triển (mô phỏng kiến trúc MongoDB Sharded Cluster), bao gồm:
- **Storage Engine**: Lõi lưu trữ B+ Tree chuẩn ACID trên nền LMDB, mã hóa tài liệu nhị phân MessagePack (tương đương BSON của MongoDB).
- **Distributed Sharding**:
  - **Router Gateway (tương đương `mongos`)**: Cổng điều phối trung tâm tại cổng `8000`, sử dụng **Consistent Hash Ring with Virtual Nodes** để định tuyến ghi/đọc tài liệu đến đúng Shard.
  - **Shard Nodes (tương đương `mongod`)**: Các nút lưu trữ dữ liệu độc lập tại cổng `8001`, `8002`, ...
  - **Scatter-Gather Engine**: Quét và tổng hợp dữ liệu song song trên toàn cụm Shards khi truy vấn.
- **Cloud Backup (MinIO / S3)**: Tự động nén và tải compact snapshot lên kho lưu trữ đám mây.
- **Web Dashboard (Frontend React + Vite)**: Giao diện quản lý trực quan CSDL, danh sách Collection, Document, theo dõi sức khỏe cụm Shards và công cụ AI Query.

---

## 1. Yêu cầu môi trường
- Python >= 3.10
- Node.js & npm
- Docker & Docker Compose (tùy chọn nếu muốn chạy cụm container)

---

## 2. Cài đặt thư viện

### Cài đặt thư viện Python (Lõi CSDL):
```bash
cd backend
pip install -r requirements.txt
```

### Cài đặt thư viện Frontend (Dashboard):
```bash
cd frontend
npm install
```

---

## 3. Khởi động hệ thống

### Cách 1: Khởi động nhanh trên máy tính (Không cần Docker)

1. **Khởi động toàn bộ cụm CSDL (Shard 1, Shard 2, Router)**:
   * **Cách A (File .bat)**: Nhấp đúp chuột vào file `scripts/start-cluster-local.bat`.
   * **Cách B (PowerShell)**:
     ```powershell
     .\scripts\start-cluster-local.ps1
     ```

2. **Khởi động Giao diện Web Dashboard**:
   Mở một terminal mới:
   ```bash
   cd frontend
   npm run dev
   ```
   Truy cập vào địa chỉ: `http://localhost:5173`.

---

### Cách 2: Khởi động qua Docker Compose (Kèm Cloud MinIO S3)
```bash
docker compose up --build
```
Hệ thống sẽ tự động khởi động:
- MinIO S3 Server: `http://localhost:9000` (Console UI: `http://localhost:9001`)
- Shard 1 Node: `http://localhost:8001`
- Shard 2 Node: `http://localhost:8002`
- Router Gateway: `http://localhost:8000`

---

## 4. Các Endpoint API của HifeDB Router Gateway (Port 8000)

* `GET /api/health`: Kiểm tra trạng thái Router và số lượng Shards đang kết nối.
* `GET /api/replication-status` hoặc `/cluster/status`: Thống kê tài nguyên, dung lượng và trạng thái của từng Shard Node.
* `POST /api/v1/{collection}/insert`: Chèn document mới (tự động băm `_id` qua Consistent Hash Ring và điều hướng về Shard phụ trách).
* `GET /api/v1/{collection}/{doc_id}`: Lấy document theo `_id`.
* `PUT /api/v1/{collection}/{doc_id}`: Cập nhật document.
* `DELETE /api/v1/{collection}/{doc_id}`: Xóa document.
* `GET /api/v1/{collection}/scan/all`: Truy vấn Scatter-Gather toàn cụm.
* `POST /api/ai/generate`: Tạo truy vấn JSON filter bằng AI.
* `POST /api/ai/execute`: Thực thi truy vấn AI trên toàn cụm Shards.
