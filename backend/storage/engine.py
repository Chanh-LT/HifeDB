# storage/engine.py
import os
from pathlib import Path
from typing import Any, Dict, List, Optional
import lmdb

from storage.index import IndexManager
from storage.keys import generate_id, make_doc_key
from storage.serializer import deserialize_doc, serialize_doc


class Collection:
    """Xử lý các thao tác CRUD cấp độ tài liệu thông qua Transaction của LMDB."""

    def __init__(self, engine: "StorageEngine", name: str):
        self.engine = engine
        self.name = name
        self.indexes = IndexManager(self)

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
            # Cập nhật các trường được đánh index
            self.indexes.on_insert(txn, doc_copy)

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

            old_doc = deserialize_doc(raw_bytes)
            doc = dict(old_doc)
            doc.update(update_fields)
            doc["_id"] = doc_id  # Đảm bảo giữ nguyên _id

            txn.put(key, serialize_doc(doc))
            # Cập nhật lại index (xóa cũ, thêm mới)
            self.indexes.on_delete(txn, old_doc)
            self.indexes.on_insert(txn, doc)
            return True

    def delete_by_id(self, doc_id: str) -> bool:
        """Xóa document theo _id."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        key = make_doc_key(self.name, doc_id)

        with self.engine.env.begin(write=True) as txn:
            raw_bytes = txn.get(key)
            if raw_bytes is None:
                return False
            old_doc = deserialize_doc(raw_bytes)
            self.indexes.on_delete(txn, old_doc)
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

    def find(self, query: Dict[str, Any] = None, limit: int = 100, skip: int = 0) -> List[Dict[str, Any]]:
        """Truy vấn danh sách documents sử dụng QueryEngine."""
        from storage.query import QueryEngine
        qe = QueryEngine(self)
        return qe.execute_find(query or {}, limit=limit, skip=skip)

    def create_index(self, field: str):
        """Tạo index cho một trường trên collection."""
        self.indexes.create_index(field)

    def drop_index(self, field: str):
        """Xóa index cho một trường trên collection."""
        self.indexes.drop_index(field)

    def list_indexes(self) -> List[str]:
        """Lấy danh sách các trường đang được đánh index."""
        return self.indexes.list_indexes()

    def drop(self) -> bool:
        """Xóa toàn bộ documents và metadata index của collection."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        prefix_doc = f"doc:{self.name}:".encode("utf-8")
        prefix_idx = f"idx:{self.name}:".encode("utf-8")

        with self.engine.env.begin(write=True) as txn:
            cursor = txn.cursor()
            # Xóa docs
            to_del = []
            if cursor.set_range(prefix_doc):
                for k, _ in cursor:
                    if not k.startswith(prefix_doc):
                        break
                    to_del.append(k)
            # Xóa idx
            if cursor.set_range(prefix_idx):
                for k, _ in cursor:
                    if not k.startswith(prefix_idx):
                        break
                    to_del.append(k)
            # Xóa meta
            to_del.append(self.indexes._meta_key())

            for k in to_del:
                txn.delete(k)

        self.indexes.indexed_fields.clear()
        return True

    def truncate(self) -> int:
        """Xóa toàn bộ documents trong collection nhưng giữ lại định nghĩa collection."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")

        prefix_doc = f"doc:{self.name}:".encode("utf-8")
        prefix_idx = f"idx:{self.name}:".encode("utf-8")
        count = 0

        with self.engine.env.begin(write=True) as txn:
            cursor = txn.cursor()
            to_del = []
            if cursor.set_range(prefix_doc):
                for k, _ in cursor:
                    if not k.startswith(prefix_doc):
                        break
                    to_del.append(k)
            count = len(to_del)
            if cursor.set_range(prefix_idx):
                for k, _ in cursor:
                    if not k.startswith(prefix_idx):
                        break
                    to_del.append(k)

            for k in to_del:
                txn.delete(k)

        return count

    def rename(self, new_name: str) -> bool:
        """Đổi tên collection và di chuyển toàn bộ documents và indexes."""
        if not self.engine.is_open():
            raise RuntimeError("Database chưa được mở hoặc đã đóng.")
        if not new_name or new_name == self.name:
            return False

        old_prefix_doc = f"doc:{self.name}:".encode("utf-8")
        new_prefix_doc = f"doc:{new_name}:".encode("utf-8")
        old_prefix_idx = f"idx:{self.name}:".encode("utf-8")
        new_prefix_idx = f"idx:{new_name}:".encode("utf-8")

        with self.engine.env.begin(write=True) as txn:
            cursor = txn.cursor()
            # Di chuyển docs
            doc_moves = []
            if cursor.set_range(old_prefix_doc):
                for k, v in cursor:
                    if not k.startswith(old_prefix_doc):
                        break
                    suffix = k[len(old_prefix_doc):]
                    doc_moves.append((k, new_prefix_doc + suffix, v))

            # Di chuyển indexes
            idx_moves = []
            if cursor.set_range(old_prefix_idx):
                for k, v in cursor:
                    if not k.startswith(old_prefix_idx):
                        break
                    suffix = k[len(old_prefix_idx):]
                    idx_moves.append((k, new_prefix_idx + suffix, v))

            # Thực hiện ghi mới và xóa cũ
            for old_k, new_k, v in doc_moves:
                txn.put(new_k, v)
                txn.delete(old_k)

            for old_k, new_k, v in idx_moves:
                txn.put(new_k, v)
                txn.delete(old_k)

            # Di chuyển metadata index
            old_meta_k = self.indexes._meta_key()
            meta_val = txn.get(old_meta_k)
            if meta_val:
                new_indexes = IndexManager(Collection(self.engine, new_name))
                txn.put(new_indexes._meta_key(), meta_val)
                txn.delete(old_meta_k)

        self.name = new_name
        self.indexes = IndexManager(self)
        return True

    def update_many(self, filter_query: Dict[str, Any], update_fields: Dict[str, Any]) -> int:
        """Cập nhật hàng loạt các documents khớp với bộ lọc."""
        from storage.query import QueryEngine
        qe = QueryEngine(self)
        matched_docs = qe.execute_find(filter_query, limit=10000)
        modified_count = 0
        for doc in matched_docs:
            doc_id = doc.get("_id")
            if doc_id and self.update_by_id(str(doc_id), update_fields):
                modified_count += 1
        return modified_count

    def delete_many(self, filter_query: Dict[str, Any]) -> int:
        """Xóa hàng loạt các documents khớp với bộ lọc."""
        from storage.query import QueryEngine
        qe = QueryEngine(self)
        matched_docs = qe.execute_find(filter_query, limit=10000)
        deleted_count = 0
        for doc in matched_docs:
            doc_id = doc.get("_id")
            if doc_id and self.delete_by_id(str(doc_id)):
                deleted_count += 1
        return deleted_count


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

    def get_stats(self) -> Dict[str, Any]:
        """Thống kê số lượng entries và dung lượng Virtual Memory của LMDB."""
        if not self.is_open():
            return {"entries_count": 0, "map_size_bytes": 0}
        try:
            stat = self.env.stat()
            info = self.env.info()
            return {
                "entries_count": stat.get("entries", 0),
                "map_size_bytes": info.get("map_size", self.map_size),
            }
        except Exception:
            return {"entries_count": 0, "map_size_bytes": self.map_size}

    def list_collections(self) -> List[str]:
        """Lấy danh sách các collection hiện có trong StorageEngine."""
        if not self.is_open():
            return []
        cols = set()
        prefix = b"doc:"
        with self.env.begin(write=False) as txn:
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                for k, _ in cursor:
                    if not k.startswith(prefix):
                        break
                    parts = k.decode("utf-8").split(":")
                    if len(parts) >= 2:
                        cols.add(parts[1])
        return sorted(list(cols))

    def close(self) -> None:
        if self.env:
            self.env.sync()
            self.env.close()
            self.env = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()