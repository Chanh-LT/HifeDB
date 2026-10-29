# router/config.py
import os
from typing import List
from pydantic_settings import BaseSettings


class RouterSettings(BaseSettings):
    host: str = os.getenv("ROUTER_HOST", "0.0.0.0")
    port: int = int(os.getenv("ROUTER_PORT", "8000"))
    
    # Chuỗi URL các shard phân cách bởi dấu phẩy
    raw_shards: str = os.getenv(
        "SHARD_NODES", 
        "http://localhost:8001,http://localhost:8002,http://localhost:8003"
    )
    vnodes_per_shard: int = 150

    @property
    def shard_urls(self) -> List[str]:
        return [url.strip() for url in self.raw_shards.split(",") if url.strip()]

    class Config:
        env_file = ".env"


settings = RouterSettings()