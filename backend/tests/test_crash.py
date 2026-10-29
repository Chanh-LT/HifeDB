# tests/test_crash.py
import multiprocessing
import os
import shutil
import time
from storage.engine import StorageEngine

DB_TEST_PATH = "./data/crash_test_db"
TOTAL_RECORDS = 50_000
CRASH_AT = 25_000


def writer_process_target(db_path: str):
    """Tiến trình giả lập ghi tải lớn và gặp sự cố sập nguồn (kill -9)."""
    print(f"\n[Writer PID: {os.getpid()}] Khởi động ghi {TOTAL_RECORDS} documents...")
    
    # Khởi tạo engine trong tiến trình con
    engine = StorageEngine(db_path=db_path, sync=True)
    users = engine["users"]

    start_time = time.time()
    for i in range(1, TOTAL_RECORDS + 1):
        doc = {
            "seq": i,
            "title": f"Document index #{i}",
            "payload": "x" * 128,  # Giả lập payload ~128 bytes
            "timestamp": time.time(),
        }
        users.insert_one(doc)

        if i % 5000 == 0:
            print(f"[Writer] Đã ghi và commit an toàn: {i} bản ghi...")

        # Giả lập sập nguồn đột ngột ngay tại bản ghi CRASH_AT
        if i == CRASH_AT:
            elapsed = time.time() - start_time
            print(f"\n[CRASH SIMULATION] Đã đạt mốc {i} bản ghi sau {elapsed:.2f}s!")
            print("[CRASH SIMULATION] Kích hoạt crash hệ thống ngay lập tức (SIGKILL / os._exit)...")
            # os._exit ngắt tiến trình tức thì, không chạy cleanup handler hay buffer flush
            os._exit(137)


def test_crash_recovery():
    # Dọn dẹp thư mục test cũ
    if os.path.exists(DB_TEST_PATH):
        shutil.rmtree(DB_TEST_PATH)

    print("=" * 60)
    print("BẮT ĐẦU BÀI KIỂM THỬ TÍNH BỀN BỈ (CRASH RECOVERY TEST)")
    print("=" * 60)

    # 1. Chạy tiến trình con để ghi dữ liệu
    p = multiprocessing.Process(target=writer_process_target, args=(DB_TEST_PATH,))
    p.start()
    p.join()  # Chờ tiến trình con crash

    print(f"\n[Master] Tiến trình Writer đã kết thúc với Exit Code: {p.exitcode} (Crash thành công)")

    # 2. Mở lại Database để kiểm tra tính toàn vẹn
    print("\n[Master] Đang khởi động lại Storage Engine để kiểm tra tính toàn vẹn dữ liệu...")
    try:
        with StorageEngine(db_path=DB_TEST_PATH) as engine:
            users = engine["users"]
            recovered_count = users.count()

            print(f"[Master] Phục hồi thành công! Tổng số document đọc được: {recovered_count}")
            
            # Kiểm chứng tính đúng đắn: Số bản ghi phục hồi phải đúng bằng số bản ghi đã commit
            assert recovered_count == CRASH_AT, (
                f"Lỗi toàn vẹn: Kỳ vọng {CRASH_AT} records nhưng đọc được {recovered_count}"
            )

            # Lấy ngẫu nhiên bản ghi cuối cùng trước khi crash để deserialize kiểm tra
            print("[Master] Đang đọc quét ngẫu nhiên để xác thực dữ liệu không bị lỗi bit/corrupt...")
            prefix = b"doc:users:"
            sample_read_count = 0
            with engine.env.begin(write=False) as txn:
                cursor = txn.cursor()
                if cursor.set_range(prefix):
                    for _, val in cursor:
                        from storage.serializer import deserialize_doc
                        doc = deserialize_doc(val)
                        assert "seq" in doc and "payload" in doc
                        sample_read_count += 1

            print(f"[Master] Đã giải mã thành công {sample_read_count}/{recovered_count} bản ghi mà không gặp lỗi!")
            print("\n=> KẾT LUẬN: Đạt chuẩn ACID (Durability). Database không bị hỏng sau khi crash.")

    except Exception as e:
        print(f"\n[FAIL] Database bị lỗi hỏng sau sự cố: {e}")
        raise


if __name__ == "__main__":
    test_crash_recovery()