# router/server.py
import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
import httpx
import uvicorn

from cluster.hash_ring import ConsistentHashRing
from router.config import settings
from storage.keys import generate_id

# Hash Ring quản lý định tuyến Shards
hash_ring = ConsistentHashRing(replicas=settings.vnodes_per_shard)
http_client: Optional[httpx.AsyncClient] = None

# Đường dẫn file metadata lưu thông tin databases và collections
META_FILE = Path("./data/router_meta.json")

DEFAULT_DATABASES = {
    "shop_db": ["products", "customers", "orders", "categories"],
    "movie_db": ["movies", "genres", "reviews"],
    "student_db": ["students", "courses", "grades"],
    "analytics_db": ["events", "metrics"],
}


def load_databases_meta() -> Dict[str, List[str]]:
    """Đọc cấu trúc database & collection từ file dữ liệu bền vững."""
    if META_FILE.exists():
        try:
            with open(META_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {k: list(v) for k, v in data.items()}
        except Exception as e:
            print(f"[HifeDB Router] Lỗi đọc router_meta.json: {e}")
    return {k: list(v) for k, v in DEFAULT_DATABASES.items()}


def save_databases_meta(meta: Dict[str, List[str]]) -> None:
    """Ghi cấu trúc database & collection vào file dữ liệu."""
    try:
        META_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(META_FILE, "w", encoding="utf-8") as f:
            json.dump({k: sorted(list(set(v))) for k, v in meta.items()}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[HifeDB Router] Lỗi ghi router_meta.json: {e}")


databases_meta: Dict[str, List[str]] = load_databases_meta()


# ============================================================================
# SEED INITIAL SAMPLE DATA NẾU CỤM SHARDS ĐANG TRỐNG
# ============================================================================

SAMPLE_PRODUCTS = [
    {"name": "MacBook Air M3 15 inch", "category": "laptop", "price": 32990000, "stock": 14, "active": True, "brand": "Apple"},
    {"name": "Dell XPS 13 Plus", "category": "laptop", "price": 28990000, "stock": 8, "active": True, "brand": "Dell"},
    {"name": "Lenovo ThinkPad X1 Carbon", "category": "laptop", "price": 35500000, "stock": 5, "active": True, "brand": "Lenovo"},
    {"name": "Chuột không dây Logitech MX Master 3S", "category": "accessory", "price": 2490000, "stock": 35, "active": True, "brand": "Logitech"},
    {"name": "Bàn phím cơ Keychron K3 Pro", "category": "accessory", "price": 2250000, "stock": 0, "active": False, "brand": "Keychron"},
    {"name": "Màn hình Dell UltraSharp 27 4K U2723QE", "category": "monitor", "price": 13990000, "stock": 12, "active": True, "brand": "Dell"},
    {"name": "Màn hình LG DualUp 28 inch", "category": "monitor", "price": 12500000, "stock": 4, "active": True, "brand": "LG"},
    {"name": "Tai nghe Sony WH-1000XM5", "category": "accessory", "price": 7990000, "stock": 20, "active": True, "brand": "Sony"},
    {"name": "iPad Pro 11 M4", "category": "tablet", "price": 25990000, "stock": 11, "active": True, "brand": "Apple"},
    {"name": "Cáp sạc Anker PowerLine III USB-C", "category": "accessory", "price": 320000, "stock": 60, "active": True, "brand": "Anker"},
]

SAMPLE_MOVIES = [
    {"title": "Dune: Part Two", "genre": "Action", "year": 2024, "rating": 8.6, "director": "Denis Villeneuve", "active": True},
    {"title": "Oppenheimer", "genre": "Drama", "year": 2023, "rating": 8.9, "director": "Christopher Nolan", "active": True},
    {"title": "The Dark Knight", "genre": "Action", "year": 2008, "rating": 9.0, "director": "Christopher Nolan", "active": True},
    {"title": "Inception", "genre": "Sci-Fi", "year": 2010, "rating": 8.8, "director": "Christopher Nolan", "active": True},
    {"title": "Interstellar", "genre": "Sci-Fi", "year": 2014, "rating": 8.7, "director": "Christopher Nolan", "active": True},
    {"title": "Spider-Man: Across the Spider-Verse", "genre": "Animation", "year": 2023, "rating": 8.7, "director": "Joaquim Dos Santos", "active": True},
]


async def seed_cluster_if_empty():
    """Kiểm tra và tự động nạp dữ liệu mẫu ban đầu nếu cụm Shard chưa có document."""
    await asyncio.sleep(1.5)  # Đợi các shard khởi động hoàn tất
    shards = hash_ring.get_all_nodes()
    if not shards:
        return

    try:
        # Kiểm tra xem collection products đã có tài liệu chưa
        resp = await http_client.post(f"{shards[0]}/api/v1/products/scan", json={"limit": 1}, timeout=2.0)
        if resp.status_code == 200 and len(resp.json()) > 0:
            return  # Đã có dữ liệu, không cần seed
    except Exception:
        pass

    print("[HifeDB Router] Đang nạp dữ liệu phân tán mẫu (Distributed Data Seeding)...")
    for prod in SAMPLE_PRODUCTS:
        doc_id = generate_id()
        doc = dict(prod)
        doc["_id"] = doc_id
        target = hash_ring.get_node(doc_id)
        if target:
            try:
                await http_client.post(f"{target}/api/v1/products/insert", json={"document": doc}, timeout=2.0)
            except Exception:
                pass

    for mov in SAMPLE_MOVIES:
        doc_id = generate_id()
        doc = dict(mov)
        doc["_id"] = doc_id
        target = hash_ring.get_node(doc_id)
        if target:
            try:
                await http_client.post(f"{target}/api/v1/movies/insert", json={"document": doc}, timeout=2.0)
            except Exception:
                pass
    print("[HifeDB Router] Dữ liệu mẫu đã được băm và phân bổ đều lên các Shards!")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời HTTP Client và nạp danh sách Shards vào Hash Ring."""
    global http_client, hash_ring
    print("[HifeDB Router] Starting HTTP Client and registering Shards...")
    http_client = httpx.AsyncClient(timeout=10.0)

    for shard_url in settings.shard_urls:
        hash_ring.add_node(shard_url)
        print(f"[HifeDB Router] -> Registered Shard into Hash Ring: {shard_url}")

    # Chạy background task kiểm tra seed dữ liệu
    asyncio.create_task(seed_cluster_if_empty())

    yield

    print("[HifeDB Router] Closing HTTP Client...")
    await http_client.aclose()


app = FastAPI(
    title="HifeDB Distributed Router Gateway (mongos)",
    version="1.0.0",
    description="Router Gateway phân phối truy vấn tới các Shard Nodes qua Consistent Hash Ring",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# 1. KIỂM TRA TRẠNG THÁI HỆ THỐNG & CỤM SHARDS
# ============================================================================

@app.get("/api/health")
async def health_check():
    """Kiểm tra Router Gateway."""
    return {
        "success": True,
        "message": "HifeDB Router Gateway đang hoạt động!",
        "version": "1.0.0",
        "active_shards": len(hash_ring.get_all_nodes()),
        "virtual_nodes": len(hash_ring.ring),
    }


@app.get("/api/replication-status")
@app.get("/cluster/status")
async def get_cluster_status():
    """Kiểm tra sức khỏe đồng loạt và thống kê tài nguyên trên toàn bộ các Shards."""
    shards = hash_ring.get_all_nodes()

    async def check_shard(url: str):
        t0 = time.time()
        try:
            resp = await http_client.get(f"{url}/stats", timeout=3.0)
            latency_ms = round((time.time() - t0) * 1000, 1)
            if resp.status_code == 200:
                data = resp.json()
                node_id = data.get("node_id", url)
                return {
                    "name": node_id,
                    "url": url,
                    "state": "PRIMARY" if "1" in node_id else "SECONDARY",
                    "health": 1,
                    "status": "Healthy",
                    "latency_ms": latency_ms,
                    "entries": data.get("entries_count", 0),
                    "map_size_mb": round(data.get("map_size_bytes", 0) / (1024 * 1024), 1),
                    "collections": data.get("collections", {}),
                }
            return {
                "name": url,
                "url": url,
                "state": "UNKNOWN",
                "health": 0,
                "status": f"HTTP {resp.status_code}",
                "latency_ms": latency_ms,
            }
        except Exception:
            return {
                "name": url,
                "url": url,
                "state": "OFFLINE",
                "health": 0,
                "status": "Unreachable",
                "latency_ms": 0,
            }

    stats_tasks = [check_shard(s) for s in shards]
    cluster_stats = await asyncio.gather(*stats_tasks) if shards else []

    healthy_count = sum(1 for s in cluster_stats if s.get("health") == 1)

    return {
        "success": True,
        "replicaSet": "HifeDB-ShardedCluster",
        "router": {
            "port": settings.port,
            "sharding_algorithm": "Consistent Hashing with MD5",
            "virtual_nodes_per_shard": settings.vnodes_per_shard,
            "total_virtual_nodes": len(hash_ring.ring),
            "status": "Healthy",
        },
        "total_shards": len(shards),
        "healthy_shards": healthy_count,
        "members": cluster_stats,
    }


# ============================================================================
# 2. QUẢN TRỊ DATABASE VÀ COLLECTION TRÊN DASHBOARD
# ============================================================================

@app.get("/api/databases")
async def list_databases():
    """Lấy danh sách các database và tổng hợp số document, dung lượng từ các shards."""
    shards = hash_ring.get_all_nodes()
    shard_stats_list = []

    if shards:
        tasks = [http_client.get(f"{s}/stats", timeout=2.5) for s in shards]
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for r in responses:
            if not isinstance(r, Exception) and r.status_code == 200:
                shard_stats_list.append(r.json())

    # Tổng hợp document count cho từng collection trên toàn cụm
    cluster_col_counts = {}
    for st in shard_stats_list:
        for c_name, c_cnt in st.get("collections", {}).items():
            cluster_col_counts[c_name] = cluster_col_counts.get(c_name, 0) + c_cnt

    dbs = []
    idx = 0
    for db_name, cols in databases_meta.items():
        idx += 1
        total_docs = sum(cluster_col_counts.get(c, 0) for c in cols)
        dbs.append({
            "id": idx,
            "name": db_name,
            "collections": len(cols),
            "documents": total_docs,
            "sizeOnDisk": total_docs * 1024 + 1024 * 1024 * 4,
            "size": f"{(total_docs * 0.05 + 1.2):.1f} MB",
            "empty": total_docs == 0,
            "status": "Healthy",
            "updated": "Vừa đồng bộ",
        })

    return {"success": True, "databases": dbs}


@app.post("/api/databases")
async def create_database(payload: Dict[str, Any]):
    """Tạo database mới trong cluster."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên database không hợp lệ.")
    if name not in databases_meta:
        databases_meta[name] = ["records"]
        save_databases_meta(databases_meta)
    return {
        "success": True,
        "message": f"Tạo database '{name}' thành công!",
        "database": name,
    }


@app.delete("/api/databases/{name}")
async def delete_database(name: str):
    """Xóa database và các collection liên quan."""
    if name in databases_meta:
        cols = list(databases_meta[name])
        del databases_meta[name]
        save_databases_meta(databases_meta)

        # Xóa các collections trên shards
        shards = hash_ring.get_all_nodes()
        for s in shards:
            for c in cols:
                try:
                    await http_client.delete(f"{s}/api/v1/{c}")
                except Exception:
                    pass

    return {"success": True, "message": f"Đã xóa database '{name}' thành công."}


@app.get("/api/databases/{name}/collections")
async def list_collections(name: str):
    """Lấy danh sách collections trong database cùng số lượng document thực tế."""
    cols = databases_meta.get(name, [])

    # Thống kê số document từ các shards
    shards = hash_ring.get_all_nodes()
    col_counts = {c: 0 for c in cols}

    if shards:
        for s in shards:
            try:
                resp = await http_client.get(f"{s}/stats", timeout=2.0)
                if resp.status_code == 200:
                    shard_cols = resp.json().get("collections", {})
                    for c in cols:
                        col_counts[c] += shard_cols.get(c, 0)
            except Exception:
                pass

    collection_details = []
    for c in sorted(cols):
        cnt = col_counts.get(c, 0)
        collection_details.append({
            "name": c,
            "documents": cnt,
            "size": f"{(cnt * 0.04 + 0.5):.1f} MB",
            "index": 1,
            "updated": "Trực tiếp từ Shards",
        })

    return {
        "success": True,
        "database": name,
        "collections": cols,
        "details": collection_details,
    }


@app.post("/api/databases/{name}/collections")
async def create_collection(name: str, payload: Dict[str, Any]):
    """Tạo collection mới trong database."""
    col_name = payload.get("collectionName", "").strip()
    if not col_name:
        raise HTTPException(status_code=400, detail="Tên collection không hợp lệ.")
    if name not in databases_meta:
        databases_meta[name] = []
    if col_name not in databases_meta[name]:
        databases_meta[name].append(col_name)
        save_databases_meta(databases_meta)
    return {
        "success": True,
        "message": f"Tạo collection '{col_name}' thành công!",
        "database": name,
        "collection": col_name,
    }


@app.delete("/api/databases/{name}/collections/{col}")
async def delete_collection(name: str, col: str):
    """Xóa collection khỏi database và dọn sạch trên tất cả Shards."""
    if name in databases_meta and col in databases_meta[name]:
        databases_meta[name].remove(col)
        save_databases_meta(databases_meta)

    shards = hash_ring.get_all_nodes()
    for s in shards:
        try:
            await http_client.delete(f"{s}/api/v1/{col}")
        except Exception:
            pass

    return {"success": True, "message": f"Đã xóa collection '{col}' thành công."}


# ============================================================================
# 3. ĐỊNH TUYẾN DỮ LIỆU ĐẾN SHARD (POINT-TO-POINT ROUTING)
# ============================================================================

@app.post("/api/v1/{collection}/insert", status_code=status.HTTP_201_CREATED)
async def insert_document(collection: str, payload: Dict[str, Any]):
    """
    1. Sinh _id 24 ký tự Hex cho document (chuẩn MongoDB).
    2. Dùng Consistent Hash Ring xác định Shard phụ trách.
    3. Gửi tài liệu đến Shard đó để ghi vào LMDB B+ Tree.
    """
    doc = dict(payload.get("document", payload))
    doc_id = str(doc.setdefault("_id", generate_id()))

    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=503, detail="Không có Shard Node nào hoạt động.")

    # Đảm bảo collection được ghi nhận trong metadata
    active_db = "shop_db"
    if collection in ["movies", "genres", "reviews"]:
        active_db = "movie_db"
    elif collection in ["students", "courses", "grades"]:
        active_db = "student_db"

    if active_db in databases_meta and collection not in databases_meta[active_db]:
        databases_meta[active_db].append(collection)
        save_databases_meta(databases_meta)

    url = f"{target_shard}/api/v1/{collection}/insert"
    try:
        resp = await http_client.post(url, json={"document": doc})
        if resp.status_code != status.HTTP_201_CREATED:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)

        data = resp.json()
        data["routed_shard"] = target_shard
        data["document"] = doc
        return data
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Lỗi kết nối tới Shard Node ({target_shard}): {str(exc)}",
        )


@app.get("/api/v1/{collection}/{doc_id}")
async def get_document(collection: str, doc_id: str):
    """Băm _id để tìm thẳng Shard Node chứa tài liệu."""
    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=503, detail="Không có Shard Node nào khả dụng.")

    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.get(url)
        if resp.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=404,
                detail=f"Không tìm thấy document '{doc_id}' trên shard ({target_shard}).",
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        doc = resp.json()
        doc["_shard"] = target_shard
        return doc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


@app.put("/api/v1/{collection}/{doc_id}")
async def update_document(collection: str, doc_id: str, payload: Dict[str, Any]):
    """Định tuyến cập nhật tài liệu đến đúng Shard Node."""
    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=503, detail="Không có Shard Node nào khả dụng.")

    fields = payload.get("update_fields", payload)
    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.put(url, json={"update_fields": fields})
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


@app.delete("/api/v1/{collection}/{doc_id}")
async def delete_document(collection: str, doc_id: str):
    """Định tuyến xóa tài liệu đến đúng Shard Node."""
    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=503, detail="Không có Shard Node nào khả dụng.")

    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.delete(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


# ============================================================================
# 4. TRUY VẤN PHÁT TÁN VÀ THU THẬP (SCATTER-GATHER ENGINE)
# ============================================================================

async def _fetch_from_shard(shard_url: str, collection: str, limit: int) -> List[Dict[str, Any]]:
    """Gửi yêu cầu scan tài liệu tới một Shard."""
    url = f"{shard_url}/api/v1/{collection}/scan"
    try:
        resp = await http_client.post(url, json={"limit": limit}, timeout=8.0)
        if resp.status_code == 200:
            docs = resp.json()
            for d in docs:
                d["_shard"] = shard_url
            return docs
        print(f"[Router Warning] Shard {shard_url} scan error {resp.status_code}: {resp.text}")
        return []
    except Exception as e:
        print(f"[Router Warning] Không thể kết nối Shard {shard_url} scan: {e}")
        return []


@app.get("/api/v1/{collection}/scan/all")
@app.get("/api/v1/{collection}/documents")
async def scan_all_shards(
    collection: str,
    limit: int = Query(default=100, ge=1, le=1000),
    search: Optional[str] = None,
):
    """
    Cơ chế Scatter-Gather:
    - Scatter: Gửi truy vấn đồng thời đến TẤT CẢ Shards trong cụm.
    - Gather: Tổng hợp toàn bộ documents trả về một danh sách duy nhất.
    """
    shards = hash_ring.get_all_nodes()
    if not shards:
        return {
            "success": True,
            "shards_queried": 0,
            "total_documents": 0,
            "documents": [],
        }

    tasks = [_fetch_from_shard(shard, collection, limit) for shard in shards]
    scatter_results = await asyncio.gather(*tasks)

    aggregated: List[Dict[str, Any]] = []
    for shard_docs in scatter_results:
        aggregated.extend(shard_docs)

    # Lọc client-side nếu có chuỗi tìm kiếm text search
    if search:
        search_lower = search.lower()
        aggregated = [
            d for d in aggregated
            if any(search_lower in str(v).lower() for v in d.values())
        ]

    return {
        "success": True,
        "shards_queried": len(shards),
        "total_documents": len(aggregated),
        "documents": aggregated[:limit],
    }


@app.post("/api/v1/{collection}/query")
async def query_cluster(collection: str, payload: Dict[str, Any]):
    """
    Phân tán truy vấn JSON filter sử dụng QueryEngine tới TẤT CẢ Shards và gom kết quả.
    """
    shards = hash_ring.get_all_nodes()
    if not shards:
        return []

    async def query_shard(shard_url: str):
        try:
            resp = await http_client.post(
                f"{shard_url}/api/v1/{collection}/query",
                json=payload,
                timeout=4.0,
            )
            if resp.status_code == 200:
                docs = resp.json()
                for d in docs:
                    d["_shard"] = shard_url
                return docs
            return []
        except Exception:
            return []

    tasks = [query_shard(s) for s in shards]
    scatter_results = await asyncio.gather(*tasks)

    merged: List[Dict[str, Any]] = []
    for docs in scatter_results:
        merged.extend(docs)

    return merged


# ============================================================================
# 5. QUẢN TRỊ INDEXES TRÊN CỤM
# ============================================================================

@app.get("/api/v1/{collection}/indexes")
async def get_indexes(collection: str):
    """Lấy danh sách các index hiện có trên collection từ cụm Shards."""
    shards = hash_ring.get_all_nodes()
    indexes = set(["_id_"])
    for s in shards:
        try:
            resp = await http_client.get(f"{s}/api/v1/{collection}/indexes", timeout=2.0)
            if resp.status_code == 200:
                data = resp.json()
                for idx_field in data.get("indexes", []):
                    indexes.add(f"{idx_field}_1")
        except Exception:
            pass

    return {
        "success": True,
        "collection": collection,
        "indexes": sorted(list(indexes)),
    }


@app.post("/api/v1/{collection}/indexes")
async def create_index_on_cluster(collection: str, payload: Dict[str, str]):
    """Phát tán lệnh tạo index đến TẤT CẢ các Shard Node trong cụm."""
    field = payload.get("field")
    if not field:
        raise HTTPException(status_code=400, detail="Thiếu trường 'field' để tạo index.")

    shards = hash_ring.get_all_nodes()
    results = []
    for s in shards:
        try:
            resp = await http_client.post(f"{s}/api/v1/{collection}/indexes", json={"field": field}, timeout=3.0)
            results.append({"shard": s, "status": resp.status_code})
        except Exception as e:
            results.append({"shard": s, "error": str(e)})

    return {
        "success": True,
        "message": f"Đã phát tán tạo index cho trường '{field}' trên toàn bộ {len(shards)} Shards.",
        "results": results,
    }


@app.delete("/api/v1/{collection}/indexes/{field}")
async def drop_index_on_cluster(collection: str, field: str):
    """Hủy index trên toàn bộ cụm Shard."""
    shards = hash_ring.get_all_nodes()
    for s in shards:
        try:
            await http_client.delete(f"{s}/api/v1/{collection}/indexes/{field}")
        except Exception:
            pass
    return {"success": True, "message": f"Đã xóa index cho trường '{field}' trên toàn bộ cụm Shards."}


# ============================================================================
# 6. AI QUERY ENGINE (TÍCH HỢP TRỰC TIẾP TRÊN ROUTER GATEWAY)
# ============================================================================

@app.post("/api/ai/generate")
async def ai_generate_query(payload: Dict[str, Any]):
    """Dùng AI / NLP để dịch câu hỏi tự nhiên thành truy vấn JSON filter cho HifeDB."""
    prompt = payload.get("prompt") or payload.get("question") or ""
    collection = payload.get("collection", "products")
    database = payload.get("database", "shop_db")

    if not prompt.strip():
        raise HTTPException(status_code=400, detail="Vui lòng cung cấp prompt hoặc question.")

    prompt_lower = prompt.lower().strip()
    filter_obj = {}
    explanation_parts = []

    # 1. Nhận diện Collection nếu chưa khớp
    if any(w in prompt_lower for w in ["phim", "movie", "đạo diễn", "năm sản xuất"]):
        collection = "movies"
        database = "movie_db"
    elif any(w in prompt_lower for w in ["sinh viên", "học sinh", "điểm", "student"]):
        collection = "students"
        database = "student_db"

    # 2. Xử lý các điều kiện cho Collection 'products'
    if collection == "products":
        if "laptop" in prompt_lower or "máy tính xách tay" in prompt_lower:
            filter_obj["category"] = "laptop"
            explanation_parts.append("Danh mục: Laptop")
        elif "chuột" in prompt_lower or "phím" in prompt_lower or "phụ kiện" in prompt_lower or "tai nghe" in prompt_lower:
            filter_obj["category"] = "accessory"
            explanation_parts.append("Danh mục: Phụ kiện (accessory)")
        elif "màn hình" in prompt_lower or "monitor" in prompt_lower:
            filter_obj["category"] = "monitor"
            explanation_parts.append("Danh mục: Màn hình (monitor)")

        if "hết hàng" in prompt_lower or "stock = 0" in prompt_lower:
            filter_obj["stock"] = 0
            explanation_parts.append("Tình trạng: Hết hàng (stock = 0)")
        elif "còn hàng" in prompt_lower:
            filter_obj["stock"] = {"$gt": 0}
            explanation_parts.append("Tình trạng: Còn hàng (stock > 0)")

        # Phân tích giá cả
        price_gt = re.search(r"(?:lớn hơn|trên|>|từ)\s*(\d+(?:[.,]\d+)?)\s*(triệu|tr|k|nghìn|dong|đ)?", prompt_lower)
        price_lt = re.search(r"(?:nhỏ hơn|dưới|<)\s*(\d+(?:[.,]\d+)?)\s*(triệu|tr|k|nghìn|dong|đ)?", prompt_lower)

        if price_gt:
            num = float(price_gt.group(1).replace(",", "."))
            unit = price_gt.group(2) or ""
            multiplier = 1000000 if "tr" in unit else (1000 if "k" in unit or "nghìn" in unit else 1)
            val = int(num * multiplier) if multiplier > 1 else int(num)
            filter_obj.setdefault("price", {})["$gte"] = val
            explanation_parts.append(f"Giá >= {val:,} VNĐ")

        if price_lt:
            num = float(price_lt.group(1).replace(",", "."))
            unit = price_lt.group(2) or ""
            multiplier = 1000000 if "tr" in unit else (1000 if "k" in unit or "nghìn" in unit else 1)
            val = int(num * multiplier) if multiplier > 1 else int(num)
            filter_obj.setdefault("price", {})["$lte"] = val
            explanation_parts.append(f"Giá <= {val:,} VNĐ")

        if "active" in prompt_lower or "đang bán" in prompt_lower:
            filter_obj["active"] = True
            explanation_parts.append("Trạng thái: Đang bán (active: True)")

    # 3. Xử lý các điều kiện cho Collection 'movies'
    elif collection == "movies":
        if "hành động" in prompt_lower or "action" in prompt_lower:
            filter_obj["genre"] = "Action"
            explanation_parts.append("Thể loại: Hành động (Action)")
        elif "viễn tưởng" in prompt_lower or "sci-fi" in prompt_lower:
            filter_obj["genre"] = "Sci-Fi"
            explanation_parts.append("Thể loại: Viễn tưởng (Sci-Fi)")
        elif "hoạt hình" in prompt_lower or "animation" in prompt_lower:
            filter_obj["genre"] = "Animation"
            explanation_parts.append("Thể loại: Hoạt hình (Animation)")
        elif "tâm lý" in prompt_lower or "drama" in prompt_lower:
            filter_obj["genre"] = "Drama"
            explanation_parts.append("Thể loại: Tâm lý (Drama)")

        # Năm sản xuất
        year_match = re.search(r"\b(19\d{2}|20\d{2})\b", prompt_lower)
        if year_match:
            year_val = int(year_match.group(1))
            if "từ năm" in prompt_lower or "sau năm" in prompt_lower:
                filter_obj["year"] = {"$gte": year_val}
                explanation_parts.append(f"Năm sản xuất >= {year_val}")
            else:
                filter_obj["year"] = year_val
                explanation_parts.append(f"Năm sản xuất: {year_val}")

        # Điểm đánh giá (Rating)
        rating_match = re.search(r"(?:rating|điểm|đánh giá)\s*(?:trên|>|từ)\s*(\d+(?:[.,]\d+)?)", prompt_lower)
        if rating_match:
            r_val = float(rating_match.group(1).replace(",", "."))
            filter_obj["rating"] = {"$gte": r_val}
            explanation_parts.append(f"Rating >= {r_val}")

    # Fallback nếu không có filter cụ thể
    if not filter_obj:
        filter_obj["active"] = True
        explanation_parts.append("Lọc mặc định: active: True")

    explanation_str = " | ".join(explanation_parts)

    return {
        "success": True,
        "query": {
            "collection": collection,
            "database": database,
            "filter": filter_obj,
            "projection": {},
            "sort": {"_id": -1},
            "limit": 20,
        },
        "explanation": f"HifeDB AI Agent đã tạo truy vấn lọc trên '{database}.{collection}': {explanation_str}",
    }


@app.post("/api/ai/execute")
async def ai_execute_query(payload: Dict[str, Any]):
    """Thực thi truy vấn JSON đã sinh bởi AI trên toàn cụm Shards."""
    collection = payload.get("collection", "products")
    query_filter = payload.get("filter", {})
    limit = int(payload.get("limit", 20))

    # Scatter-gather scan
    shards = hash_ring.get_all_nodes()
    raw_docs = []

    if shards:
        tasks = [_fetch_from_shard(shard, collection, limit * 3) for shard in shards]
        scatter_results = await asyncio.gather(*tasks)
        for s_docs in scatter_results:
            raw_docs.extend(s_docs)
    else:
        raw_docs = SAMPLE_PRODUCTS

    # Áp dụng bộ lọc in-memory
    def match_doc(doc):
        for k, cond in query_filter.items():
            val = doc.get(k)
            if isinstance(cond, dict):
                for op, t in cond.items():
                    if op == "$gte" and not (val is not None and val >= t):
                        return False
                    if op == "$gt" and not (val is not None and val > t):
                        return False
                    if op == "$lte" and not (val is not None and val <= t):
                        return False
                    if op == "$lt" and not (val is not None and val < t):
                        return False
                    if op == "$eq" and val != t:
                        return False
                    if op == "$ne" and val == t:
                        return False
                    if op == "$in" and val not in t:
                        return False
            else:
                if val != cond:
                    return False
        return True

    matched = [d for d in raw_docs if match_doc(d)]
    return {
        "success": True,
        "count": len(matched[:limit]),
        "documents": matched[:limit],
    }


if __name__ == "__main__":
    uvicorn.run("router.server:app", host=settings.host, port=settings.port, reload=False)
