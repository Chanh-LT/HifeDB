# Hướng Dẫn Chi Tiết Triển Khai HifeDB Lên Cloud & Công Khai Thành Website

Tài liệu này hướng dẫn chi tiết từng bước cách đưa toàn bộ cụm **Hệ Quản Trị CSDL Phân Tán HifeDB** cùng **Giao diện Web Dashboard** lên môi trường Cloud công khai 24/7.

---

## 1. Kiến trúc phân tán của HifeDB khi lên Cloud

Khi triển khai trên Cloud, cụm HifeDB hoạt động theo mô hình:
```
               [ Khách hàng / Trình duyệt Web ]
                               |
                               v (Port 80 / HTTPS)
                    +----------------------+
                    |  HifeDB Web Dashboard|  (React + Nginx Reverse Proxy)
                    +----------------------+
                               |
                               v (Port 8000 - Nội bộ / Public)
                    +----------------------+
                    |  Router Gateway      |  (mongos / Consistent Hash Ring)
                    +----------------------+
                               |
               +---------------+---------------+
               |                               |
               v                               v
     +--------------------+          +--------------------+
     |   Shard Node 1     |          |   Shard Node 2     |
     | (LMDB B+ Tree ACID)|          | (LMDB B+ Tree ACID)|
     |    (Port 8001)     |          |    (Port 8002)     |
     +--------------------+          +--------------------+
               |                               |
               +---------------+---------------+
                               |
                               v (Port 9000 - Cloud S3 Snapshot)
                    +----------------------+
                    |   MinIO Cloud S3     |
                    +----------------------+
```

---

## 2. PHƯƠNG PHÁP 1: Triển Khai Trọn Gói Qua Docker Compose (KHUYÊN DÙNG)
> **Phù hợp nhất:** Thuê 1 máy chủ ảo Cloud VPS (Render, Railway, Fly.io, AWS EC2, DigitalOcean, Hetzner, Vultr hoặc Linode).

Toàn bộ hệ thống (Web Dashboard, Router Gateway, Shard 1, Shard 2, MinIO S3) đã được đóng gói sẵn trong file `docker-compose.yaml`.

### Bước 1: Đẩy mã nguồn dự án lên GitHub
1. Tạo một repository mới trên GitHub (ví dụ: `HifeDB-Cluster`).
2. Mở terminal tại thư mục dự án trên máy của bạn và chạy:
   ```bash
   git init
   git add .
   git commit -m "Deploy: Hoàn thiện cụm HifeDB và Dashboard"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan-cua-ban>/HifeDB-Cluster.git
   git push -u origin main
   ```

### Bước 2: Chuẩn bị máy chủ Cloud (VPS Linux)
1. Thuê 1 VPS Linux (hệ điều hành **Ubuntu 22.04** hoặc **24.04** LTS).
2. Cài đặt Docker & Docker Compose trên VPS (nếu chưa có):
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-v2
   sudo systemctl enable --now docker
   ```

### Bước 3: Khởi chạy cụm HifeDB trên VPS
1. Clone dự án về VPS:
   ```bash
   git clone https://github.com/<tai-khoan-cua-ban>/HifeDB-Cluster.git
   cd HifeDB-Cluster
   ```
2. Khởi chạy toàn bộ hệ thống bằng 1 lệnh duy nhất:
   ```bash
   sudo docker compose up -d --build
   ```
3. Kiểm tra trạng thái các container đang chạy:
   ```bash
   sudo docker compose ps
   ```
   Bạn sẽ thấy 4 container online:
   - `hifedb-dashboard`: Cổng `80` (Web Dashboard người dùng)
   - `router-gateway`: Cổng `8000` (Router CSDL)
   - `shard-1`: Cổng `8001` (Lưu trữ B+ Tree Shard 1)
   - `shard-2`: Cổng `8002` (Lưu trữ B+ Tree Shard 2)
   - `minio-s3`: Cổng `9000` / `9001` (Cloud Backup)

### Bước 4: Truy cập Website công khai
Mở trình duyệt và truy cập:
- **Giao diện Web Dashboard**: `http://<IP-VPS-CUA-BAN>`
- **Router Gateway API**: `http://<IP-VPS-CUA-BAN>:8000/api/health`
- **MinIO Cloud Console**: `http://<IP-VPS-CUA-BAN>:9001` (User: `minioadmin` / Pass: `minioadmin`)

---

## 3. PHƯƠNG PHÁP 2: Tách biệt Frontend (Vercel) + Backend (Render / Railway)

Nếu bạn muốn Web Frontend có tên miền đẹp miễn phí dạng `https://ten-du-an.vercel.app` với chứng chỉ SSL/HTTPS tự động:

### Bước 1: Deploy Backend (Router + Shards) lên Render hoặc Railway
1. Đăng ký tài khoản tại [render.com](https://render.com) hoặc [railway.app](https://railway.app).
2. Chọn **New Web Service** -> Kết nối với repo GitHub vừa tạo.
3. Cấu hình chạy Dockerfile với cổng `8000`.
4. Sau khi deploy xong, bạn sẽ nhận được 1 đường link Router công khai (ví dụ: `https://hifedb-router.onrender.com`).

### Bước 2: Deploy Frontend lên Vercel
1. Đăng ký tài khoản tại [vercel.com](https://vercel.com).
2. Nhấn **Add New Project** -> Chọn GitHub repo của bạn.
3. Trong mục **Root Directory**, chọn thư mục: `frontend`.
4. Tại phần **Environment Variables**, thêm biến:
   - Key: `VITE_API_URL`
   - Value: `https://hifedb-router.onrender.com` *(đường link Router ở Bước 1)*
5. Nhấn **Deploy**.
6. Sau khoảng 1 phút, Vercel sẽ cấp cho bạn một trang web công khai có HTTPS:
   `https://hifedb-dashboard.vercel.app`

---

## 4. Gắn Tên Miền Riêng (Domain) & Bật HTTPS Miễn Phí (Tùy chọn)

Nếu bạn có tên miền riêng (ví dụ: `hifedb.com` hoặc `csdl.click`):
1. **Trỏ DNS**:
   - Vào nhà cung cấp tên miền (Namecheap, Cloudflare, Matbao, Tenten).
   - Thêm bản ghi `A record`: `@` -> trỏ về `IP-VPS-CUA-BAN`.
2. **Cài SSL HTTPS miễn phí bằng Certbot (Chỉ 2 dòng lệnh)**:
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d hifedb.com
   ```
Website của bạn sẽ lập tức có ổ khóa xanh bảo mật `https://hifedb.com`!
