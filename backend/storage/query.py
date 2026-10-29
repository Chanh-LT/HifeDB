from storage.serializer import deserialize_doc
from storage.keys import make_doc_key

class QueryEngine:
    def __init__(self, collection):
        self.collection = collection
        self.engine = collection.engine

    def execute_find(self, query: dict):
        results = []
        with self.engine.env.begin(write=False) as txn:
            # 1. TÌM XEM CÂU QUERY CÓ THỂ DÙNG MỤC LỤC KHÔNG?
            indexed_field = None
            for field in query:
                # Nếu trường này có index và đang tìm kiếm chính xác (không dùng toán tử $gt, $lt)
                if field in self.collection.indexes.indexed_fields and not isinstance(query[field], dict):
                    indexed_field = field
                    break

            # 2. CÓ MỤC LỤC -> TÌM SIÊU NHANH
            if indexed_field:
                # Lấy danh sách ID từ mục lục
                doc_ids = self.collection.indexes.find_ids(txn, indexed_field, query[indexed_field])
                
                # Bốc dữ liệu thật bằng ID
                for doc_id in doc_ids:
                    raw = txn.get(make_doc_key(self.collection.name, doc_id))
                    if raw:
                        doc = deserialize_doc(raw)
                        # Lọc lại các điều kiện còn lại (ví dụ: tuổi lớn hơn 20)
                        if self._match(doc, query):
                            results.append(doc)
                return results

            # 3. KHÔNG CÓ MỤC LỤC -> BẮT BUỘC PHẢI FULL SCAN
            prefix = f"doc:{self.collection.name}:".encode("utf-8")
            cursor = txn.cursor()
            if cursor.set_range(prefix):
                for k, v in cursor:
                    if not k.startswith(prefix): 
                        break
                    doc = deserialize_doc(v)
                    if self._match(doc, query):
                        results.append(doc)
        return results

    def _match(self, doc, query):
        """Hàm kiểm tra xem document có thỏa mãn tất cả điều kiện lọc không."""
        for field, condition in query.items():
            doc_val = doc.get(field)
            
            # Tìm kiếm chính xác: {"city": "HCM"}
            if not isinstance(condition, dict):
                if doc_val != condition: 
                    return False
                continue
                
            # Tìm kiếm toán tử: {"age": {"$gte": 18}}
            for op, target_val in condition.items():
                if op == "$gt" and not (doc_val is not None and doc_val > target_val): return False
                if op == "$gte" and not (doc_val is not None and doc_val >= target_val): return False
                if op == "$lt" and not (doc_val is not None and doc_val < target_val): return False
                if op == "$lte" and not (doc_val is not None and doc_val <= target_val): return False
                if op == "$in" and doc_val not in target_val: return False
        return True