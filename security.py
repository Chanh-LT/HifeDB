from cryptography.fernet import Fernet
import hashlib
import hmac
import time

# ==========================================
# 1. MODULE ĐỊNH DANH (AUTHENTICATION)
# ==========================================
class AuthManager:
    def __init__(self, secret_key="cloud_db_secret"):
        self.secret_key = secret_key.encode()
        self.valid_tokens = set() # Giả lập lưu token đang hoạt động

    def generate_token(self, username):
        """Sinh token định danh dựa trên username"""
        message = f"{username}:{time.time()}".encode() #tạo gói DL: tên + thời gian hiện tại
        token = hmac.new(self.secret_key, message, hashlib.sha256).hexdigest()
        self.valid_tokens.add(token)
        return token

    def verify_token(self, token):
        """Kiểm tra vé (token) có hợp lệ không trước khi cho thao tác với DB"""
        return token in self.valid_tokens


# ==========================================
# 2. MODULE MÃ HÓA KEY (ENCRYPTION)
# ==========================================
class EncryptionManager:
    def __init__(self):
        # Tạo khóa bí mật dùng thuật toán AES (Fernet)
        self.key = Fernet.generate_key()
        self.cipher = Fernet(self.key)

    def encrypt_data(self, plain_text):
        """Mã hóa chuỗi nhạy cảm (mật khẩu, secret key...) trước khi lưu vào DB"""
        #plain_text.encode(): biến chuỗi thành dạng byte
        #cipher.encrypt: xáo trộn đóng byte ->DB
        #decode(): chuyển byte sang văn bản
        return self.cipher.encrypt(plain_text.encode()).decode()

    def decrypt_data(self, cipher_text):
        """Giải mã dữ liệu khi cần dùng"""
        #cipher.decrypt: dịch ngược lại dữ liệu đã encrypt về DL gốc <- DB

        return self.cipher.decrypt(cipher_text.encode()).decode()
