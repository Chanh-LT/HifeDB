# shard/schemas.py
from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class InsertDocRequest(BaseModel):
    document: Dict[str, Any] = Field(..., description="Nội dung tài liệu JSON cần lưu trữ")


class InsertDocResponse(BaseModel):
    success: bool
    doc_id: str
    node_id: str


class UpdateDocRequest(BaseModel):
    update_fields: Dict[str, Any] = Field(..., description="Các trường dữ liệu cần cập nhật/thêm mới")


class BaseResponse(BaseModel):
    success: bool
    message: str


class ScanRequest(BaseModel):
    limit: int = Field(100, ge=1, le=1000, description="Số lượng bản ghi tối đa lấy về")


class ShardStatsResponse(BaseModel):
    node_id: str
    status: str
    db_path: str
    entries_count: int
    map_size_bytes: int
    collections: Dict[str, int]