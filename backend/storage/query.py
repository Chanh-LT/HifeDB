import re
from storage.serializer import deserialize_doc
from storage.keys import make_doc_key

class QueryEngine:
    def __init__(self, collection):
        self.collection = collection
        self.engine = collection.engine

    def execute_find(self, query: dict = None, limit: int = 100, skip: int = 0):
        query = query or {}
        results = []
        with self.engine.env.begin(write=False) as txn:
            # 1. TÌM XEM CÂU QUERY CÓ THỂ DÙNG MỤC LỤC KHÔNG?
            indexed_field = None
            if hasattr(self.collection, "indexes") and self.collection.indexes:
                for field in query:
                    # Nếu trường này có index và đang tìm kiếm chính xác (không dùng toán tử $gt, $lt)
                    if field in self.collection.indexes.indexed_fields and not isinstance(query[field], dict):
                        indexed_field = field
                        break

            # 2. CÓ MỤC LỤC -> TÌM SIÊU NHANH
            if indexed_field:
                doc_ids = self.collection.indexes.find_ids(txn, indexed_field, query[indexed_field])
                skipped = 0
                for doc_id in doc_ids:
                    raw = txn.get(make_doc_key(self.collection.name, doc_id))
                    if raw:
                        doc = deserialize_doc(raw)
                        if self._match(doc, query):
                            if skipped < skip:
                                skipped += 1
                                continue
                            results.append(doc)
                            if limit > 0 and len(results) >= limit:
                                break
                return results

            # 3. KHÔNG CÓ MỤC LỤC -> BẮT BUỘC PHẢI FULL SCAN
            prefix = f"doc:{self.collection.name}:".encode("utf-8")
            cursor = txn.cursor()
            skipped = 0
            if cursor.set_range(prefix):
                for k, v in cursor:
                    if not k.startswith(prefix): 
                        break
                    doc = deserialize_doc(v)
                    if self._match(doc, query):
                        if skipped < skip:
                            skipped += 1
                            continue
                        results.append(doc)
                        if limit > 0 and len(results) >= limit:
                            break
        return results

    def _match(self, doc, query):
        """Hàm kiểm tra xem document có thỏa mãn tất cả điều kiện lọc không."""
        if not query:
            return True

        for field, condition in query.items():
            doc_val = doc.get(field)
            
            # Tìm kiếm chính xác: {"city": "HCM"} hoặc {"active": True}
            if not isinstance(condition, dict):
                if doc_val != condition: 
                    return False
                continue
                
            # Tìm kiếm toán tử: {"age": {"$gte": 18}}
            for op, target_val in condition.items():
                if op == "$eq" and doc_val != target_val: return False
                if op == "$ne" and doc_val == target_val: return False
                if op == "$gt" and not (doc_val is not None and doc_val > target_val): return False
                if op == "$gte" and not (doc_val is not None and doc_val >= target_val): return False
                if op == "$lt" and not (doc_val is not None and doc_val < target_val): return False
                if op == "$lte" and not (doc_val is not None and doc_val <= target_val): return False
                if op == "$in" and doc_val not in target_val: return False
                if op == "$nin" and doc_val in target_val: return False
                if op == "$exists":
                    exists = field in doc and doc[field] is not None
                    if exists != bool(target_val):
                        return False
                if op == "$regex":
                    try:
                        if not re.search(str(target_val), str(doc_val or ""), re.IGNORECASE):
                            return False
                    except Exception:
                        return False
        return True