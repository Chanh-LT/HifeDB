# router/server.py
import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, status
import httpx
import uvicorn

from cluster.hash_ring import ConsistentHashRing
from router.config import settings
from storage.keys import generate_id

# Quản lý tài nguyên dùng chung trong Router
hash_ring = ConsistentHashRing(replicas=settings.vnodes_per_shard)
http_client: httpx.AsyncClient = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời Client HTTP và đăng ký các Shard Node vào Hash Ring."""
    global http_client, hash_ring
    print("[Router] Đang khởi động HTTP Client và nạp danh sách Shards...")
    http_client = httpx.AsyncClient(timeout=5.0)

    for shard_url in settings.shard_urls:
        hash_ring.add_node(shard_url)
        print(f"[Router] -> Đã đăng ký node vào Hash Ring: {shard_url}")

    yield

    print("[Router] Đang đóng HTTP Client...")
    await http_client.aclose()


app = FastAPI(
    title="Cloud-Native Document DB - Router Node (mongos)",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================================
# 1. CÁC THAO TÁC ĐỊNH TUYẾN TRỰC TIẾP (POINT-TO-POINT ROUTING)
# ============================================================================

@app.post(
    "/api/v1/{collection}/insert",
    status_code=status.HTTP_201_CREATED,
    response_model=Dict[str, Any],
)
async def insert_document(collection: str, payload: Dict[str, Any]):
    """
    1. Kiểm tra/sinh _id cho tài liệu.
    2. Dùng Hash Ring xác định Shard phụ trách lưu trữ.
    3. Forward payload đến Shard đó.
    """
    doc = dict(payload)
    doc_id = str(doc.setdefault("_id", generate_id()))

    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=500, detail="Không có Shard Node nào sẵn sàng.")

    url = f"{target_shard}/api/v1/{collection}/insert"
    try:
        resp = await http_client.post(url, json={"document": doc})
        if resp.status_code != status.HTTP_201_CREATED:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        
        data = resp.json()
        data["routed_shard"] = target_shard
        return data
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503, 
            detail=f"Lỗi kết nối tới Shard Node ({target_shard}): {str(exc)}"
        )


@app.get("/api/v1/{collection}/{doc_id}", response_model=Dict[str, Any])
async def get_document(collection: str, doc_id: str):
    """Băm _id để tìm thẳng node chứa dữ liệu mà không cần hỏi các node khác."""
    target_shard = hash_ring.get_node(doc_id)
    if not target_shard:
        raise HTTPException(status_code=500, detail="Không có Shard Node nào khả dụng.")

    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.get(url)
        if resp.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(
                status_code=404, 
                detail=f"Không tìm thấy document '{doc_id}' trên shard phụ trách ({target_shard})."
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


@app.put("/api/v1/{collection}/{doc_id}", response_model=Dict[str, Any])
async def update_document(collection: str, doc_id: str, payload: Dict[str, Any]):
    """Định tuyến yêu cầu cập nhật đến đúng node lưu trữ doc_id."""
    target_shard = hash_ring.get_node(doc_id)
    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.put(url, json={"update_fields": payload})
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


@app.delete("/api/v1/{collection}/{doc_id}", response_model=Dict[str, Any])
async def delete_document(collection: str, doc_id: str):
    """Định tuyến yêu cầu xóa đến đúng node lưu trữ doc_id."""
    target_shard = hash_ring.get_node(doc_id)
    url = f"{target_shard}/api/v1/{collection}/{doc_id}"
    try:
        resp = await http_client.delete(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Không thể kết nối shard: {str(exc)}")


# ============================================================================
# 2. CƠ CHẾ PHÁT TÁN VÀ THU THẬP (SCATTER-GATHER)
# ============================================================================

async def _fetch_from_shard(shard_url: str, collection: str, limit: int) -> List[Dict[str, Any]]:
    """Hàm phụ trợ gửi request scan tới 1 Shard cụ thể."""
    url = f"{shard_url}/api/v1/{collection}/scan"
    try:
        resp = await http_client.post(url, json={"limit": limit}, timeout=3.0)
        if resp.status_code == 200:
            return resp.json()
        return []
    except Exception as e:
        print(f"[Scatter-Gather Warning] Lỗi khi scan trên {shard_url}: {e}")
        return []


@app.get("/api/v1/{collection}/scan/all", response_model=Dict[str, Any])
async def scan_all_shards(collection: str, limit: int = 100):
    """
    Cơ chế Scatter-Gather:
    - Scatter: Gửi đồng thời request scan đến TẤT CẢ các Shard Node.
    - Gather: Đợi kết quả gom lại thành 1 mảng dữ liệu duy nhất.
    """
    shards = hash_ring.get_all_nodes()
    if not shards:
        return {"total": 0, "results": []}

    # Scatter: Chạy song song bất đồng bộ qua asyncio.gather
    tasks = [_fetch_from_shard(shard, collection, limit) for shard in shards]
    scatter_results = await asyncio.gather(*tasks)

    # Gather: Gộp mảng kết quả từ tất cả các node
    aggregated: List[Dict[str, Any]] = []
    for shard_docs in scatter_results:
        aggregated.extend(shard_docs)

    return {
        "shards_queried": len(shards),
        "total_documents": len(aggregated),
        "documents": aggregated[:limit],
    }


# ============================================================================
# 3. QUẢN TRỊ VÀ GIÁM SÁT CỤM (CLUSTER STATUS)
# ============================================================================

@app.get("/cluster/status", response_model=Dict[str, Any])
async def get_cluster_status():
    """Kiểm tra sức khỏe đồng loạt và thống kê tài nguyên trên toàn bộ các Shards."""
    shards = hash_ring.get_all_nodes()
    
    async def check_shard(url: str):
        try:
            resp = await http_client.get(f"{url}/stats", timeout=2.0)
            if resp.status_code == 200:
                return resp.json()
            return {"node_id": url, "status": "unhealthy", "code": resp.status_code}
        except Exception:
            return {"node_id": url, "status": "unreachable"}

    stats_tasks = [check_shard(s) for s in shards]
    cluster_stats = await asyncio.gather(*stats_tasks)

    return {
        "total_shards": len(shards),
        "shards": cluster_stats,
    }


if __name__ == "__main__":
    uvicorn.run("router.server:app", host=settings.host, port=settings.port, reload=False)