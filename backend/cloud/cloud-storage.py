# cloud/storage.py
import os
import tarfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
import boto3
from botocore.client import Config
from botocore.exceptions import ClientError


class CloudBackupManager:
    def __init__(
        self,
        endpoint_url: str = os.getenv("S3_ENDPOINT", "http://localhost:9000"),
        access_key: str = os.getenv("S3_ACCESS_KEY", "minioadmin"),
        secret_key: str = os.getenv("S3_SECRET_KEY", "minioadmin"),
        bucket_name: str = os.getenv("S3_BUCKET", "database-backups"),
        region: str = os.getenv("S3_REGION", "us-east-1"),
    ):
        self.bucket_name = bucket_name
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
            config=Config(signature_version="s3v4"),
        )
        self._ensure_bucket_exists()

    def _ensure_bucket_exists(self) -> None:
        """Tự động tạo bucket nếu trên MinIO/S3 chưa có."""
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
        except ClientError:
            try:
                self.s3_client.create_bucket(Bucket=self.bucket_name)
                print(f"[CloudBackup] Đã khởi tạo bucket mới: {self.bucket_name}")
            except Exception as e:
                print(f"[CloudBackup Warning] Không thể tạo bucket: {e}")

    def upload_snapshot(self, node_id: str, snapshot_db_file: Path) -> Dict[str, str]:
        """
        Nén file snapshot data.mdb thành tar.gz và upload lên S3 bucket.
        Đường dẫn lưu: backups/{node_id}/snapshot_{timestamp}.tar.gz
        """
        if not snapshot_db_file.exists():
            raise FileNotFoundError(f"File snapshot không tồn tại: {snapshot_db_file}")

        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        s3_key = f"backups/{node_id}/snapshot_{timestamp}.tar.gz"

        with tempfile.TemporaryDirectory() as tmp_dir:
            archive_path = Path(tmp_dir) / f"{node_id}_{timestamp}.tar.gz"

            # 1. Nén file snapshot
            with tarfile.open(archive_path, "w:gz") as tar:
                tar.add(snapshot_db_file, arcname="data.mdb")

            file_size_mb = archive_path.stat().st_size / (1024 * 1024)
            print(f"[CloudBackup] Đang upload {s3_key} ({file_size_mb:.2f} MB) lên Cloud...")

            # 2. Upload qua boto3
            self.s3_client.upload_file(
                Filename=str(archive_path),
                Bucket=self.bucket_name,
                Key=s3_key,
                ExtraArgs={"Metadata": {"node_id": node_id, "timestamp": timestamp}},
            )

        return {"s3_key": s3_key, "timestamp": timestamp, "bucket": self.bucket_name}

    def list_backups(self, node_id: str) -> List[Dict[str, str]]:
        """Lấy danh sách tất cả các bản snapshot đã lưu của một node."""
        prefix = f"backups/{node_id}/"
        response = self.s3_client.list_objects_v2(Bucket=self.bucket_name, Prefix=prefix)

        results = []
        if "Contents" in response:
            for item in response["Contents"]:
                results.append({
                    "s3_key": item["Key"],
                    "size_bytes": item["Size"],
                    "last_modified": item["LastModified"].isoformat(),
                })
        return sorted(results, key=lambda x: x["last_modified"], reverse=True)

    def restore_latest_snapshot(self, node_id: str, restore_db_dir: Path) -> bool:
        """Tải bản snapshot mới nhất từ S3 và giải nén vào thư mục dữ liệu của node."""
        backups = self.list_backups(node_id)
        if not backups:
            print(f"[CloudBackup] Không tìm thấy bản backup nào cho {node_id}")
            return False

        latest_s3_key = backups[0]["s3_key"]
        restore_db_dir.mkdir(parents=True, exist_ok=True)

        with tempfile.TemporaryDirectory() as tmp_dir:
            archive_path = Path(tmp_dir) / "downloaded.tar.gz"
            print(f"[CloudBackup] Đang tải {latest_s3_key} về phục hồi...")
            self.s3_client.download_file(self.bucket_name, latest_s3_key, str(archive_path))

            # Giải nén đè file data.mdb
            with tarfile.open(archive_path, "r:gz") as tar:
                tar.extractall(path=restore_db_dir)

        print(f"[CloudBackup] Phục hồi thành công {node_id} từ {latest_s3_key}!")
        return True