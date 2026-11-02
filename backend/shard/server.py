# shard/server.py
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from shard.config import settings
from shard.schemas import (
    BaseResponse,
    InsertDocRequest,
    InsertDocResponse,
    ScanRequest,
    ShardStatsResponse,
    UpdateDocRequest,
)
from storage.engine import StorageEngine
from storage.query import QueryEngine

engine: StorageEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời khởi tạo và đóng an toàn của StorageEngine."""
    global engine
    print(f"[{settings.node_id}] Starting StorageEngine at: {settings.db_path}...")
    engine = StorageEngine(
        db_path=settings.db_path,
        map_size=settings.map_size,
        sync=True,
    )
    yield
    print(f"[{settings.node_id}] Closing StorageEngine...")
    if engine:
        engine.close()


app = FastAPI(
    title=f"HifeDB Shard Node - {settings.node_id}",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """Endpoint kiểm tra trạng thái sống còn (Heartbeat)."""
    return {
        "status": "healthy",
        "node_id": settings.node_id,
        "port": str(settings.port),
    }


@app.post(
    "/api/v1/{collection}/insert",
    response_model=InsertDocResponse,
    status_code=status.HTTP_201_CREATED,
)
async def insert_document(collection: str, payload: InsertDocRequest):
    """Chèn một tài liệu mới vào LMDB của shard này."""
    try:
        coll = engine[collection]
        doc_id = coll.insert_one(payload.document)
        return InsertDocResponse(success=True, doc_id=doc_id, node_id=settings.node_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi hệ thống khi ghi: {str(e)}",
        )


@app.get("/api/v1/{collection}/{doc_id}", response_model=Dict[str, Any])
async def get_document(collection: str, doc_id: str):
    """Tìm nạp tài liệu theo ID."""
    coll = engine[collection]
    doc = coll.find_by_id(doc_id)
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy document với _id='{doc_id}' trên {settings.node_id}",
        )
    return doc


@app.put("/api/v1/{collection}/{doc_id}", response_model=BaseResponse)
async def update_document(collection: str, doc_id: str, payload: UpdateDocRequest):
    """Cập nhật các trường dữ liệu của tài liệu."""
    try:
        coll = engine[collection]
        updated = coll.update_by_id(doc_id, payload.update_fields)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Tài liệu _id='{doc_id}' không tồn tại để cập nhật.",
            )
        return BaseResponse(success=True, message=f"Đã cập nhật document '{doc_id}' thành công.")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@app.delete("/api/v1/{collection}/{doc_id}", response_model=BaseResponse)
async def delete_document(collection: str, doc_id: str):
    """Xóa tài liệu khỏi shard."""
    coll = engine[collection]
    deleted = coll.delete_by_id(doc_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy document '{doc_id}' để xóa.",
        )
    return BaseResponse(success=True, message=f"Đã xóa thành công document '{doc_id}'.")


@app.post("/api/v1/{collection}/scan", response_model=List[Dict[str, Any]])
async def scan_documents(collection: str, payload: ScanRequest):
    """Quét dữ liệu cục bộ phục vụ cơ chế Scatter-Gather từ Router."""
    coll = engine[collection]
    prefix = f"doc:{collection}:".encode("utf-8")
    results = []

    with engine.env.begin(write=False) as txn:
        cursor = txn.cursor()
        if cursor.set_range(prefix):
            from storage.serializer import deserialize_doc
            for k, v in cursor:
                if not k.startswith(prefix):
                    break
                results.append(deserialize_doc(v))
                if len(results) >= payload.limit:
                    break

    return results


@app.post("/api/v1/{collection}/query", response_model=List[Dict[str, Any]])
async def query_documents(collection: str, payload: Dict[str, Any]):
    """Thực thi truy vấn JSON filter sử dụng QueryEngine (hỗ trợ $gt, $gte, $lt, $lte, $in, $ne, $regex, $exists)."""
    coll = engine[collection]
    query_engine = QueryEngine(coll)
    # Hỗ trợ cả payload trực tiếp là query hoặc { "query": {...}, "limit": 100, "skip": 0 }
    if "query" in payload and isinstance(payload["query"], dict):
        query = payload["query"]
        limit = payload.get("limit", 100)
        skip = payload.get("skip", 0)
    else:
        query = payload
        limit = 100
        skip = 0
    return query_engine.execute_find(query, limit=limit, skip=skip)


@app.get("/api/v1/{collection}/indexes")
async def get_collection_indexes(collection: str):
    """Lấy danh sách các index của collection."""
    coll = engine[collection]
    return {
        "success": True,
        "collection": collection,
        "indexes": coll.list_indexes(),
        "node_id": settings.node_id,
    }


@app.post("/api/v1/{collection}/indexes", response_model=BaseResponse)
async def create_collection_index(collection: str, payload: Dict[str, str]):
    """Tạo index cho trường dữ liệu trên collection."""
    field = payload.get("field")
    if not field:
        raise HTTPException(status_code=400, detail="Thiếu trường 'field' để tạo index.")
    coll = engine[collection]
    coll.create_index(field)
    return BaseResponse(
        success=True,
        message=f"Đã tạo index cho trường '{field}' trên collection '{collection}' tại {settings.node_id}",
    )


@app.delete("/api/v1/{collection}/indexes/{field}", response_model=BaseResponse)
async def drop_collection_index(collection: str, field: str):
    """Xóa index của một trường."""
    coll = engine[collection]
    coll.drop_index(field)
    return BaseResponse(
        success=True,
        message=f"Đã xóa index cho trường '{field}' trên collection '{collection}' tại {settings.node_id}",
    )


@app.delete("/api/v1/{collection}", response_model=BaseResponse)
async def drop_collection(collection: str):
    """Xóa toàn bộ collection và dữ liệu của nó khỏi shard."""
    coll = engine[collection]
    coll.drop()
    return BaseResponse(
        success=True,
        message=f"Đã xóa toàn bộ collection '{collection}' trên {settings.node_id}",
    )


@app.get("/api/v1/collections")
async def list_shard_collections():
    """Lấy danh sách các collection hiện có trên shard."""
    return {
        "success": True,
        "node_id": settings.node_id,
        "collections": engine.list_collections(),
    }


@app.get("/stats", response_model=ShardStatsResponse)
async def get_node_stats():
    """Báo cáo dung lượng, số entries và thống kê các collections."""
    raw_stats = engine.get_stats()
    cols = engine.list_collections()
    col_counts = {}
    for c in cols:
        col_counts[c] = engine[c].count()
    if not col_counts:
        col_counts["default"] = 0

    return ShardStatsResponse(
        node_id=settings.node_id,
        status="running",
        db_path=str(engine.db_path),
        entries_count=raw_stats["entries_count"],
        map_size_bytes=raw_stats["map_size_bytes"],
        collections=col_counts,
    )


@app.post("/admin/snapshot", response_model=BaseResponse)
async def create_local_snapshot():
    """Tạo snapshot compact của file LMDB."""
    snapshot_dir = Path("./data/snapshots") / settings.node_id
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    target_file = snapshot_dir / "data.mdb"

    engine.env.copy(str(target_file), compact=True)

    return BaseResponse(
        success=True,
        message=f"Đã tạo compact snapshot tại {target_file}",
    )


if __name__ == "__main__":
    uvicorn.run("shard.server:app", host=settings.host, port=settings.port, reload=False)
