# shard/schemas.py
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


class RenameCollectionRequest(BaseModel):
    new_name: str = Field(..., description="Tên mới của collection")


class UpdateManyRequest(BaseModel):
    filter: Dict[str, Any] = Field(default_factory=dict, description="Bộ lọc tài liệu cần cập nhật")
    update_fields: Dict[str, Any] = Field(..., description="Các trường dữ liệu cần cập nhật")


class DeleteManyRequest(BaseModel):
    filter: Dict[str, Any] = Field(default_factory=dict, description="Bộ lọc tài liệu cần xóa")


class BatchResponse(BaseModel):
    success: bool
    matched_count: int = 0
    modified_count: int = 0
    deleted_count: int = 0
    node_id: str = ""
