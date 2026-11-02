# cluster/hash_ring.py
import bisect
import hashlib
from typing import Dict, List, Optional


class ConsistentHashRing:
    """
    Vòng băm nhất quán (Consistent Hash Ring with Virtual Nodes).
    Được sử dụng bởi Router (mongos) để phân tán và định tuyến tài liệu 
    đến các Shard Node tương ứng theo _id hoặc partition key.
    """

    def __init__(self, replicas: int = 150):
        self.replicas = replicas
        self.ring: List[int] = []
        self.node_map: Dict[int, str] = {}
        self.nodes: set = set()

    def _hash(self, key: str) -> int:
        """Băm khóa thành số nguyên 32-bit bằng MD5."""
        digest = hashlib.md5(key.encode("utf-8")).hexdigest()
        return int(digest[:8], 16)

    def add_node(self, node_url: str) -> None:
        """Thêm Shard Node vào Hash Ring và tạo các vnode tương ứng."""
        if node_url in self.nodes:
            return

        self.nodes.add(node_url)
        for i in range(self.replicas):
            vnode_key = f"{node_url}#vnode{i}"
            h = self._hash(vnode_key)
            bisect.insort(self.ring, h)
            self.node_map[h] = node_url

    def remove_node(self, node_url: str) -> None:
        """Gỡ bỏ Shard Node khỏi Hash Ring."""
        if node_url not in self.nodes:
            return

        self.nodes.remove(node_url)
        for i in range(self.replicas):
            vnode_key = f"{node_url}#vnode{i}"
            h = self._hash(vnode_key)
            idx = bisect.bisect_left(self.ring, h)
            if idx < len(self.ring) and self.ring[idx] == h:
                self.ring.pop(idx)
                self.node_map.pop(h, None)

    def get_node(self, key: str) -> Optional[str]:
        """Tìm Shard Node phụ trách khóa (doc_id) theo chiều kim đồng hồ trên vòng băm."""
        if not self.ring:
            return None

        h = self._hash(key)
        idx = bisect.bisect_right(self.ring, h)
        if idx == len(self.ring):
            idx = 0
        return self.node_map[self.ring[idx]]

    def get_all_nodes(self) -> List[str]:
        """Lấy danh sách tất cả các Shard Node đang hoạt động trong cluster."""
        return sorted(list(self.nodes))
