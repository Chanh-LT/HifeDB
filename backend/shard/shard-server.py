# shard/server.py
from contextlib import asynccontextmanager
import shutil
from pathlib import Path
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException, status
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

# Biến toàn cục giữ instance StorageEngine cho Shard Node
engine: StorageEngine = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Quản lý vòng đời khởi tạo và đóng an toàn của StorageEngine."""
    global engine
    print(f"[{settings.node_id}] Khởi động StorageEngine tại đường dẫn: {settings.db_path}...")
    engine = StorageEngine(
        db_path=settings.db_path,
        map_size=settings.map_size,
        sync=True,  # Đảm bảo chuẩn Durability của ACID
    )
    yield
    print(f"[{settings.node_id}] Nhận tín hiệu dừng, tiến hành flush và đóng StorageEngine...")
    if engine:
        engine.close()


app = FastAPI(
    title=f"Shard Node Service - {settings.node_id}",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=Dict[str, str])
async def health_check():
    """Endpoint cho Router Node kiểm tra trạng thái sống còn (Heartbeat)."""
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


@app.get("/stats", response_model=ShardStatsResponse)
async def get_node_stats():
    """Báo cáo dung lượng, số entries và thống kê các collections."""
    raw_stats = engine.get_stats()
    return ShardStatsResponse(
        node_id=settings.node_id,
        status="running",
        db_path=str(engine.db_path),
        entries_count=raw_stats["entries_count"],
        map_size_bytes=raw_stats["map_size_bytes"],
        collections={
            "users": engine["users"].count(),
        },
    )


@app.post("/admin/snapshot", response_model=BaseResponse)
async def create_local_snapshot():
    """Tạo snapshot cục bộ của file LMDB phục vụ cho Task 4 (Cloud Backup)."""
    snapshot_dir = Path("./data/snapshots") / settings.node_id
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    target_file = snapshot_dir / "data.mdb"

    # Sao chép snapshot an toàn của LMDB
    engine.env.copy(str(target_file), compact=True)

    return BaseResponse(
        success=True,
        message=f"Đã tạo compact snapshot tại {target_file}",
    )


if __name__ == "__main__":
    uvicorn.run("shard.server:app", host=settings.host, port=settings.port, reload=False)