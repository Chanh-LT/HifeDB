#!/bin/bash
# ==============================================================================
# Script: Tự động cài đặt LAMP Stack trên Amazon Linux 2023 (AWS EC2)
# Thành phần: Apache (httpd), MariaDB Server, PHP 8.2 & Extensions
# ==============================================================================

# Dừng thực thi nếu có lệnh gặp lỗi
set -e

# Đặt biến mật khẩu root cho database (hãy đổi mật khẩu này theo ý bạn)
DB_ROOT_PASSWORD="StrongPassword123!"

echo "[1/6] Cập nhật hệ điều hành..."
dnf update -y

echo "[2/6] Cài đặt Apache, MariaDB và PHP cùng các module cần thiết..."
dnf install -y \
    httpd \
    mariadb105-server \
    php \
    php-cli \
    php-common \
    php-fpm \
    php-mysqlnd \
    php-pdo \
    php-gd \
    php-mbstring \
    php-xml \
    php-opcache

echo "[3/6] Khởi động và kích hoạt các dịch vụ khởi cùng hệ thống..."
# Kích hoạt Apache
systemctl start httpd
systemctl enable httpd

# Kích hoạt MariaDB
systemctl start mariadb
systemctl enable mariadb

# Kích hoạt PHP-FPM
systemctl start php-fpm
systemctl enable php-fpm

echo "[4/6] Thiết lập phân quyền thư mục web /var/www..."
# Thêm user 'ec2-user' vào group 'apache'
usermod -a -G apache ec2-user

# Giao quyền sở hữu cho apache và group apache
chown -R ec2-user:apache /var/www

# Gán quyền thư mục 2775 (setgid) và file 0664 để deploy code thuận tiện
chmod 2775 /var/www
find /var/www -type d -exec chmod 2775 {} +
find /var/www -type f -exec chmod 0664 {} +

echo "[5/6] Tự động bảo mật MariaDB (mysql_secure_installation tự động)..."
# Thiết lập root password, xóa user ẩn danh, tắt remote root login, xóa test database
mariadb -e "SET PASSWORD FOR 'root'@'localhost' = PASSWORD('${DB_ROOT_PASSWORD}');"
mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "DELETE FROM mysql.user WHERE User='';"
mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');"
mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "DROP DATABASE IF EXISTS test;"
mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';"
mariadb -u root -p"${DB_ROOT_PASSWORD}" -e "FLUSH PRIVILEGES;"

echo "[6/6] Tạo trang kiểm tra (info.php và db_test.php)..."
# Tạo trang phpinfo
cat << 'EOF' > /var/www/html/info.php
<?php
phpinfo();
?>
EOF

# Tạo trang test kết nối Database
cat << EOF > /var/www/html/db_test.php
<?php
\$host = 'localhost';
\$user = 'root';
\$pass = '${DB_ROOT_PASSWORD}';

try {
    \$conn = new PDO("mysql:host=\$host", \$user, \$pass);
    \$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    echo "<h2 style='color:green;'>Kết nối MariaDB thành công!</h2>";
} catch(PDOException \$e) {
    echo "<h2 style='color:red;'>Kết nối MariaDB thất bại: " . \$e->getMessage() . "</h2>";
}
?>
EOF

# Khởi động lại Apache để nạp toàn bộ cấu hình mới
systemctl restart httpd

echo "=============================================================================="
echo "CÀI ĐẶT LAMP STACK HOÀN TẤT!"
echo "Database Root Password: ${DB_ROOT_PASSWORD}"
echo "Kiểm tra PHP Info:      http://<Public-IP-EC2>/info.php"
echo "Kiểm tra Database:      http://<Public-IP-EC2>/db_test.php"
echo "=============================================================================="