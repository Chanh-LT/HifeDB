# shard/config.py
import os
from pydantic_settings import BaseSettings


class ShardSettings(BaseSettings):
    node_id: str = os.getenv("NODE_ID", "shard-1")
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", "8001"))
    db_path: str = os.getenv("DB_PATH", f"./data/nodes/{os.getenv('NODE_ID', 'shard-1')}")
    map_size: int = 1024 * 1024 * 1024  # 1GB Virtual Address Space

    class Config:
        env_file = ".env"


settings = ShardSettings()