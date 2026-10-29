import json
import lmdb

def format_index_value(val):
    """
    Chuẩn hóa giá trị để LMDB sắp xếp đúng thứ tự
    Ví dụ: số 2 thành '0000002.00', để nó luôn đứng trước số 10 ('0000010.00').
    """
    if isinstance(val, (int, float)):
        """"
        Nhắc lại: 
        010.2f: kiểu float. Vế trái thêm 0 vào trái nếu chuỗi ko đủ độ dài là 10.
                            Vế phải làm tròn đến số thâp phân thứ 2
        """"
        return f"num:{float(val):010.2f}"
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

"""Dùng để đánh từng chỉ mục khi chạy chương trình"""
    def _load_metadata(self):
        """txn: giao dịch"""
        with self.engine.env.begin(write=False) as txn:
            raw = txn.get(self._meta_key())
            if raw:
                self.indexed_fields = set(json.loads(raw.decode("utf-8")))

    def create_index(self, field: str):
        """Lập mục lục cho một cột (ví dụ: 'city') và quét lại dữ liệu cũ."""
        if field in self.indexed_fields: 
            return
            
        self.indexed_fields.add(field)
        
        with self.engine.env.begin(write=True) as txn:
            # Lưu lại danh sách cột đang có index
            txn.put(self._meta_key(), json.dumps(list(self.indexed_fields)).encode("utf-8"))
            
            # Quét toàn bộ data hiện có để ghi chép vào mục lục
            prefix = f"doc:{self.collection.name}:".encode("utf-8")
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                from storage.serializer import deserialize_doc
                for k, v in cursor:
                    if not k.startswith(prefix): 
                        break
                    doc = deserialize_doc(v)
                    if field in doc:
                        idx_key = self._make_key(field, doc[field], doc["_id"])
                        txn.put(idx_key, b"")

    def _make_key(self, field, value, doc_id):
        """Tạo khóa mục lục dạng: idx:users:city:str:HCM:id_001"""
        val_str = format_index_value(value)
        return f"idx:{self.collection.name}:{field}:{val_str}:{doc_id}".encode("utf-8")

    def on_insert(self, txn, doc):
        """Tự động ghi thêm vào mục lục khi có hàm insert_one() chạy."""
        for field in self.indexed_fields:
            if field in doc:
                txn.put(self._make_key(field, doc[field], doc["_id"]), b"")

    def on_delete(self, txn, doc):
        """Tự động xóa khỏi mục lục khi document bị xóa/sửa."""
        for field in self.indexed_fields:
            if field in doc:
                txn.delete(self._make_key(field, doc[field], doc["_id"]))

    def find_ids(self, txn, field, value):
        """Tra mục lục để lấy ra danh sách các doc_id (Mã sinh viên)."""
        val_str = format_index_value(value)
        prefix = f"idx:{self.collection.name}:{field}:{val_str}:".encode("utf-8")
        
        ids = []
        cursor = txn.cursor()
        if cursor.set_range(prefix):
            for k, _ in cursor:
                if not k.startswith(prefix): 
                    break
                # Cắt chuỗi để lấy phần tử cuối cùng (chính là doc_id)
                doc_id = k.decode("utf-8").split(":")[-1]
                ids.append(doc_id)
        return ids