import json
import lmdb

def format_index_value(val):
    """
    Chuẩn hóa giá trị để LMDB sắp xếp đúng thứ tự
    Ví dụ: số 2 thành '0000000002.0000', để nó luôn đứng trước số 10.
    """
    if isinstance(val, bool):
        return f"bool:{str(val).lower()}"
    if isinstance(val, (int, float)):
        return f"num:{float(val):014.4f}"
    return f"str:{str(val)}"

class IndexManager:
    def __init__(self, collection):
        self.collection = collection
        self.engine = collection.engine
        self.indexed_fields = set()
        self._load_metadata()

    def _meta_key(self):
        """Khóa dùng để lưu danh sách các cột đang được đánh index."""
        return f"meta:idx:{self.collection.name}".encode("utf-8")

    def _load_metadata(self):
        """Tải danh sách các cột đang được đánh index khi khởi động."""
        if not self.engine.is_open():
            return
        with self.engine.env.begin(write=False) as txn:
            raw = txn.get(self._meta_key())
            if raw:
                try:
                    self.indexed_fields = set(json.loads(raw.decode("utf-8")))
                except Exception:
                    self.indexed_fields = set()

    def create_index(self, field: str):
        """Lập mục lục cho một cột (ví dụ: 'category', 'price') và quét lại dữ liệu cũ."""
        if field in self.indexed_fields: 
            return
            
        self.indexed_fields.add(field)
        
        with self.engine.env.begin(write=True) as txn:
            txn.put(self._meta_key(), json.dumps(list(self.indexed_fields)).encode("utf-8"))
            
            prefix = f"doc:{self.collection.name}:".encode("utf-8")
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                from storage.serializer import deserialize_doc
                for k, v in cursor:
                    if not k.startswith(prefix): 
                        break
                    doc = deserialize_doc(v)
                    if field in doc and doc[field] is not None:
                        idx_key = self._make_key(field, doc[field], doc["_id"])
                        txn.put(idx_key, b"")

    def drop_index(self, field: str):
        """Hủy index cho một cột và dọn sạch các khóa index tương ứng."""
        if field not in self.indexed_fields:
            return
        self.indexed_fields.remove(field)
        with self.engine.env.begin(write=True) as txn:
            txn.put(self._meta_key(), json.dumps(list(self.indexed_fields)).encode("utf-8"))
            prefix = f"idx:{self.collection.name}:{field}:".encode("utf-8")
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                to_delete = []
                for k, _ in cursor:
                    if not k.startswith(prefix):
                        break
                    to_delete.append(k)
                for k in to_delete:
                    txn.delete(k)

    def list_indexes(self):
        """Trả về danh sách các trường đang được đánh index."""
        return sorted(list(self.indexed_fields))

    def _make_key(self, field, value, doc_id):
        """Tạo khóa mục lục dạng: idx:users:city:str:HCM:id_001"""
        val_str = format_index_value(value)
        return f"idx:{self.collection.name}:{field}:{val_str}:{doc_id}".encode("utf-8")

    def on_insert(self, txn, doc):
        """Tự động ghi thêm vào mục lục khi có hàm insert_one() chạy."""
        if "_id" not in doc:
            return
        for field in self.indexed_fields:
            if field in doc and doc[field] is not None:
                txn.put(self._make_key(field, doc[field], doc["_id"]), b"")

    def on_delete(self, txn, doc):
        """Tự động xóa khỏi mục lục khi document bị xóa/sửa."""
        if "_id" not in doc:
            return
        for field in self.indexed_fields:
            if field in doc and doc[field] is not None:
                txn.delete(self._make_key(field, doc[field], doc["_id"]))

    def find_ids(self, txn, field, value):
        """Tra mục lục để lấy ra danh sách các doc_id."""
        val_str = format_index_value(value)
        prefix = f"idx:{self.collection.name}:{field}:{val_str}:".encode("utf-8")
        
        ids = []
        cursor = txn.cursor()
        if cursor.set_range(prefix):
            for k, _ in cursor:
                if not k.startswith(prefix): 
                    break
                doc_id = k.decode("utf-8").split(":")[-1]
                ids.append(doc_id)
        return ids