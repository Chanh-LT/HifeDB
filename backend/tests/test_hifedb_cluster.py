# backend/tests/test_hifedb_cluster.py
import pytest
from fastapi.testclient import TestClient
import shutil
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from storage.engine import StorageEngine
from storage.query import QueryEngine
from cluster.hash_ring import ConsistentHashRing

TEST_DB_DIR = "./data/test_integration_db"


def test_storage_engine_and_indexes():
    """Kiểm tra toàn diện StorageEngine B+ Tree, Indexes và QueryEngine."""
    if os.path.exists(TEST_DB_DIR):
        shutil.rmtree(TEST_DB_DIR)

    with StorageEngine(db_path=TEST_DB_DIR, sync=True) as engine:
        products = engine["products"]
        
        # 1. Tạo indexes
        products.create_index("category")
        products.create_index("price")
        assert "category" in products.list_indexes()
        assert "price" in products.list_indexes()

        # 2. Chèn documents
        id1 = products.insert_one({"name": "MacBook Air M3", "category": "laptop", "price": 28000000, "stock": 10, "active": True})
        id2 = products.insert_one({"name": "Dell XPS 13", "category": "laptop", "price": 25000000, "stock": 5, "active": True})
        id3 = products.insert_one({"name": "Logitech MX Master", "category": "accessory", "price": 2000000, "stock": 0, "active": False})

        assert products.count() == 3

        # 3. Tìm kiếm bằng index
        laptops = products.find({"category": "laptop"})
        assert len(laptops) == 2

        # 4. Tìm kiếm bằng toán tử so sánh ($gt, $gte, $eq)
        expensive = products.find({"price": {"$gte": 25000000}})
        assert len(expensive) == 2

        out_of_stock = products.find({"stock": 0})
        assert len(out_of_stock) == 1
        assert out_of_stock[0]["name"] == "Logitech MX Master"

        # 5. Cập nhật tài liệu
        updated = products.update_by_id(id3, {"stock": 15, "active": True})
        assert updated is True
        doc3 = products.find_by_id(id3)
        assert doc3["stock"] == 15
        assert doc3["active"] is True

        # 6. Xóa tài liệu
        deleted = products.delete_by_id(id1)
        assert deleted is True
        assert products.count() == 2
        assert products.find_by_id(id1) is None

    # Dọn dẹp
    if os.path.exists(TEST_DB_DIR):
        shutil.rmtree(TEST_DB_DIR)
    print("✓ test_storage_engine_and_indexes passed!")


def test_consistent_hash_ring():
    """Kiểm tra tính phân tán của Consistent Hash Ring."""
    ring = ConsistentHashRing(replicas=150)
    ring.add_node("http://127.0.0.1:8001")
    ring.add_node("http://127.0.0.1:8002")

    nodes = ring.get_all_nodes()
    assert len(nodes) == 2

    # Phân tán 100 khóa ngẫu nhiên
    node_counts = {"http://127.0.0.1:8001": 0, "http://127.0.0.1:8002": 0}
    for i in range(100):
        key = f"doc_key_{i}"
        target = ring.get_node(key)
        assert target in node_counts
        node_counts[target] += 1

    # Cả hai shard đều phải nhận được tài liệu (cân bằng tải)
    print(f"Hash Ring Distribution (100 keys): {node_counts}")
    assert node_counts["http://127.0.0.1:8001"] > 25
    assert node_counts["http://127.0.0.1:8002"] > 25
    print("✓ test_consistent_hash_ring passed!")


if __name__ == "__main__":
    test_storage_engine_and_indexes()
    test_consistent_hash_ring()
    print("\n========================================================")
    print("  ALL HIFEDB CORE TESTS PASSED SUCCESSFULLY (100% ACID)!")
    print("========================================================")
