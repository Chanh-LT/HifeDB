# storage/serializer.py
from typing import Any, Dict
import json
import msgpack


def serialize_doc(document: Dict[str, Any]) -> bytes:
    """
    Tuần tự hóa Document JSON sang nhị phân bằng MessagePack
    (Tương đương BSON của MongoDB, giúp tối ưu dung lượng và tốc độ đọc ghi).
    """
    try:
        return msgpack.packb(document, use_bin_type=True)
    except Exception:
        # Dự phòng serialize bằng JSON nếu có kiểu dữ liệu đặc biệt
        return json.dumps(document, ensure_ascii=False).encode("utf-8")


def deserialize_doc(raw_bytes: bytes) -> Dict[str, Any]:
    """Giải mã nhị phân thành từ điển Python (JSON Document)."""
    try:
        return msgpack.unpackb(raw_bytes, raw=False)
    except Exception:
        return json.loads(raw_bytes.decode("utf-8"))
