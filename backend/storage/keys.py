# storage/keys.py
import os
import time
import struct

_counter = 0

def generate_id() -> str:
    """
    Tạo định danh tài liệu 24 ký tự Hex tương tự MongoDB ObjectId.
    - 4 bytes: Unix timestamp
    - 5 bytes: Random machine & process identifier
    - 3 bytes: Auto-incrementing counter
    """
    global _counter
    _counter = (_counter + 1) & 0xFFFFFF

    timestamp = int(time.time())
    random_bytes = os.urandom(5)
    counter_bytes = struct.pack(">I", _counter)[1:]  # 3 bytes

    raw = struct.pack(">I", timestamp) + random_bytes + counter_bytes
    return raw.hex()


def make_doc_key(collection_name: str, doc_id: str) -> bytes:
    """Tạo khóa nhị phân để lưu trữ tài liệu trong LMDB B-Tree."""
    return f"doc:{collection_name}:{doc_id}".encode("utf-8")


def parse_doc_key(key_bytes: bytes) -> tuple:
    """Giải mã khóa doc để lấy tên collection và doc_id."""
    decoded = key_bytes.decode("utf-8")
    parts = decoded.split(":")
    if len(parts) >= 3 and parts[0] == "doc":
        collection = parts[1]
        doc_id = ":".join(parts[2:])
        return collection, doc_id
    return "", ""
