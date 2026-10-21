# storage/engine.py
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import lmdb

from storage.keys import generate_id, make_doc_key
from storage.serializer import deserialize_doc, serialize_doc


class Collection:
    """Xử lý các thao tác CRUD cấp độ tài liệu thông qua Transaction của LMDB."""

    def __init__(self, engine: "StorageEngine", name: str):
        self.engine = engine
        self.name = name

    def insert_one(self, document: Dict[str, Any]) -> str:
        """Thêm mới một document. Tự động sinh `_id` nếu chưa có."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        doc_copy = dict(document)
        doc_id = str(doc_copy.setdefault("_id", generate_id()))

        key = make_doc_key(self.name, doc_id)
        val = serialize_doc(doc_copy)

        # Write Transaction
        with self.engine.env.begin(write=True) as txn:
            success = txn.put(key, val, overwrite=False)
            if not success:
                raise ValueError(f"Document với _id='{doc_id}' đã tồn tại.")

        return doc_id

    def find_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Tìm document theo _id bằng Read-only Transaction (không tạo lock ghi)."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        key = make_doc_key(self.name, doc_id)

        # Read-only Transaction
        with self.engine.env.begin(write=False) as txn:
            raw_bytes = txn.get(key)
            if raw_bytes is None:
                return None
            return deserialize_doc(raw_bytes)

    def update_by_id(self, doc_id: str, update_fields: Dict[str, Any]) -> bool:
        """Cập nhật các trường dữ liệu của document trong cùng một Write Transaction."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        if "_id" in update_fields and str(update_fields["_id"]) != doc_id:
            raise ValueError("Không được phép sửa đổi trường '_id'.")

        key = make_doc_key(self.name, doc_id)

        with self.engine.env.begin(write=True) as txn:
            raw_bytes = txn.get(key)
            if raw_bytes is None:
                return False

            doc = deserialize_doc(raw_bytes)
            doc.update(update_fields)
            doc["_id"] = doc_id  # Đảm bảo giữ nguyên _id

            txn.put(key, serialize_doc(doc))
            return True

    def delete_by_id(self, doc_id: str) -> bool:
        """Xóa document theo _id."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        key = make_doc_key(self.name, doc_id)

        with self.engine.env.begin(write=True) as txn:
            return txn.delete(key)

    def count(self) -> int:
        """Đếm tổng số tài liệu trong collection."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        prefix = f"doc:{self.name}:".encode("utf-8")
        total = 0
        with self.engine.env.begin(write=False) as txn:
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                for k, _ in cursor:
                    if not k.startswith(prefix):
                        break
                    total += 1
        return total


class StorageEngine:
    """Quản lý môi trường LMDB, cấu hình thư mục lưu trữ và cấp phát bộ nhớ."""

    def __init__(
        self,
        db_path: str = "./data/db",
        map_size: int = 1024 * 1024 * 1024,  # Cấp phát 1GB Virtual Memory Address Space
        max_dbs: int = 10,
        sync: bool = True,  # sync=True đảm bảo tính Durability của ACID
    ):
        self.db_path = Path(db_path)
        self.map_size = map_size
        self.max_dbs = max_dbs
        self.sync = sync
        self.env: Optional[lmdb.Environment] = None

        self._init_environment()

    def _init_environment(self) -> None:
        self.db_path.mkdir(parents=True, exist_ok=True)
        self.env = lmdb.open(
            str(self.db_path),
            map_size=self.map_size,
            max_dbs=self.max_dbs,
            sync=self.sync,
            create=True,
        )

    def is_open(self) -> bool:
        return self.env is not None

    def get_collection(self, name: str) -> Collection:
        return Collection(self, name)

    def __getitem__(self, name: str) -> Collection:
        return self.get_collection(name)

    def close(self) -> None:
        if self.env:
            self.env.sync()
            self.env.close()
            self.env = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()