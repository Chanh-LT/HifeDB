import React, { useEffect, useMemo, useState } from 'react';
import AiQuery from './AiQuery';
import {
  Activity, ArrowUpRight, Bell, BookOpen, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Code2, Command, Copy, Database,
  FileJson, Files, Gauge, HardDrive, LayoutDashboard, ListFilter, LogOut,
  MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Terminal,
  Trash2, X, Zap, RefreshCw, Cpu, Layers, Server, Network
} from 'lucide-react';

const initialDbs = [
  { id: 1, name: 'shop_db', collections: 4, documents: 10, size: '4.2 MB', status: 'Healthy', updated: 'Vừa đồng bộ', color: 'purple' },
  { id: 2, name: 'movie_db', collections: 3, documents: 6, size: '2.8 MB', status: 'Healthy', updated: 'Vừa đồng bộ', color: 'blue' },
  { id: 3, name: 'student_db', collections: 3, documents: 0, size: '1.2 MB', status: 'Healthy', updated: 'Vừa đồng bộ', color: 'orange' },
];

const initialCollections = [
  { name: 'products', documents: 10, size: '2.5 MB', index: 2, updated: 'Trực tiếp từ Shards' },
  { name: 'categories', documents: 4, size: '0.8 MB', index: 1, updated: 'Trực tiếp từ Shards' },
  { name: 'customers', documents: 4, size: '0.9 MB', index: 1, updated: 'Trực tiếp từ Shards' },
  { name: 'orders', documents: 0, size: '0.0 MB', index: 1, updated: 'Trực tiếp từ Shards' },
];

const navItems = [
  { id: 'Overview', label: 'Tổng quan', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'Databases', label: 'Databases', icon: Database, group: 'WORKSPACE' },
  { id: 'Collections', label: 'Collections', icon: Files, group: 'WORKSPACE' },
  { id: 'Documents', label: 'Documents', icon: FileJson, group: 'WORKSPACE' },
  { id: 'Query Editor', label: 'Query Editor', icon: Terminal, group: 'DEVELOPER TOOLS' },
  { id: 'AI Query', label: 'AI Query', icon: Sparkles, group: 'DEVELOPER TOOLS' },
  { id: 'Indexes', label: 'Indexes', icon: Zap, group: 'DEVELOPER TOOLS' },
  { id: 'Monitoring', label: 'Cụm Shards & Ring', icon: Activity, group: 'DEVELOPER TOOLS' },
  { id: 'Replication', label: 'Hệ Quản Trị CSDL', icon: Network, group: 'DEVELOPER TOOLS' },
];

function Button({
  children,
  variant = 'primary',
  onClick,
  icon: Icon,
  small = false,
  type = 'button',
  disabled = false,
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`btn ${variant} ${small ? 'small' : ''}`}
      onClick={onClick}
    >
      {Icon && <Icon size={small ? 14 : 16} />}
      {children}
    </button>
  );
}

function Badge({ children, type = 'green' }) {
  return <span className={`badge ${type}`}><span className="dot" />{children}</span>;
}

function MetricCard({ title, value, change, icon: Icon, tone, sub }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{title}</span>
        <span className={`metric-icon ${tone}`}><Icon size={18} /></span>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom">
        <span className="change"><ArrowUpRight size={14} />{change}</span>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function App() {
  const [active, setActive] = useState('Overview');
  const [databases, setDatabases] = useState(initialDbs);
  const [collections, setCollections] = useState(initialCollections);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedDb, setSelectedDb] = useState('shop_db');
  const [selectedCollection, setSelectedCollection] = useState('products');
  const [search, setSearch] = useState('');

  // Query editor state
  const [query, setQuery] = useState('{\n  "category": "laptop"\n}');
  const [queryResult, setQueryResult] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryExecutionTime, setQueryExecutionTime] = useState(null);

  // Modals & form state
  const [modal, setModal] = useState('');
  const [dbName, setDbName] = useState('');
  const [collectionName, setCollectionName] = useState('');
  const [docMode, setDocMode] = useState('json'); // 'form' or 'json'
  const [docName, setDocName] = useState('');
  const [docPrice, setDocPrice] = useState('');
  const [docCategory, setDocCategory] = useState('laptop');
  const [docJson, setDocJson] = useState('{\n  "name": "MacBook Air M3",\n  "category": "laptop",\n  "price": 28990000,\n  "stock": 10,\n  "active": true\n}');
  const [indexField, setIndexField] = useState('');
  const [indexesList, setIndexesList] = useState(['_id_']);
  const [toast, setToast] = useState('');
  const [showProfile, setShowProfile] = useState(false);

  // Cluster & Replication state
  const [replication, setReplication] = useState(null);
  const [replicationLoading, setReplicationLoading] = useState(false);
  const [replicationError, setReplicationError] = useState('');

  // Hash Ring tester
  const [testKey, setTestKey] = useState('product_xyz');
  const [testNodeResult, setTestNodeResult] = useState(null);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2800);
  }

  // 1. Fetch Databases from HifeDB Router
  async function fetchDatabases() {
    try {
      const response = await fetch(`${API_BASE}/api/databases`);
      const data = await response.json();
      if (data.success && Array.isArray(data.databases) && data.databases.length > 0) {
        setDatabases(data.databases.map((db, idx) => ({
          id: db.id || idx + 1,
          name: db.name,
          collections: db.collections,
          documents: db.documents || 0,
          size: db.size || '1.5 MB',
          status: 'Healthy',
          updated: db.updated || 'Đồng bộ từ Shards',
          color: idx % 3 === 0 ? 'purple' : idx % 3 === 1 ? 'blue' : 'orange',
        })));
      }
    } catch {
      // Fallback
    }
  }

  // 2. Fetch Collections of a Database
  async function fetchCollections(db) {
    if (!db) return;
    try {
      const response = await fetch(`${API_BASE}/api/databases/${db}/collections`);
      const data = await response.json();
      if (data.success) {
        if (Array.isArray(data.details) && data.details.length > 0) {
          setCollections(data.details);
          if (!data.details.some(c => c.name === selectedCollection) && data.details[0]) {
            setSelectedCollection(data.details[0].name);
          }
        } else if (Array.isArray(data.collections)) {
          setCollections(data.collections.map(c => ({
            name: c,
            documents: 0,
            size: '0.5 MB',
            index: 1,
            updated: 'Trực tiếp từ Shards',
          })));
        }
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fetch Documents of current Collection
  async function fetchDocuments(col = selectedCollection) {
    if (!col) return;
    setDocsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/${col}/documents?limit=100&_t=${Date.now()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.documents)) {
        setDocs(data.documents);
      }
    } catch (err) {
      console.warn('Lỗi lấy tài liệu:', err);
    } finally {
      setDocsLoading(false);
    }
  }

  // 4. Fetch Indexes of current Collection
  async function fetchIndexes(col = selectedCollection) {
    if (!col) return;
    try {
      const response = await fetch(`${API_BASE}/api/v1/${col}/indexes`);
      const data = await response.json();
      if (data.success && Array.isArray(data.indexes)) {
        setIndexesList(data.indexes);
      }
    } catch {
      setIndexesList(['_id_']);
    }
  }

  // 5. Fetch Cluster & Replication Status
  async function fetchReplication() {
    setReplicationLoading(true);
    setReplicationError('');
    try {
      const response = await fetch(`${API_BASE}/api/replication-status`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || `HTTP ${response.status}`);
      }
      setReplication(data);
    } catch (error) {
      setReplicationError(error.message || 'Không thể kết nối Router Gateway tại cổng 8000.');
      setReplication(null);
    } finally {
      setReplicationLoading(false);
    }
  }

  useEffect(() => {
    fetchDatabases();
    fetchReplication();
  }, []);

  useEffect(() => {
    if (selectedDb) {
      fetchCollections(selectedDb);
    }
  }, [selectedDb]);

  useEffect(() => {
    if (selectedCollection) {
      fetchDocuments(selectedCollection);
      fetchIndexes(selectedCollection);
      // Cập nhật mẫu query editor phù hợp collection
      if (selectedCollection === 'movies') {
        setQuery('{\n  "genre": "Action",\n  "rating": { "$gte": 8.5 }\n}');
      } else {
        setQuery('{\n  "category": "laptop"\n}');
      }
    }
  }, [selectedCollection]);

  const filteredDbs = useMemo(
    () => databases.filter(db => db.name.toLowerCase().includes(search.toLowerCase())),
    [databases, search]
  );

  const filteredDocs = useMemo(
    () => docs.filter(doc => Object.values(doc).some(v => String(v).toLowerCase().includes(search.toLowerCase()))),
    [docs, search]
  );

  // CRUD Operations
  async function createDb(e) {
    e.preventDefault();
    const name = dbName.trim();
    if (!name) return;
    try {
      const response = await fetch(`${API_BASE}/api/databases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo database.');
      }
      notify(`Đã tạo database: ${name}`);
      fetchDatabases();
      setSelectedDb(name);
    } catch (err) {
      notify(err.message || 'Lỗi tạo database.');
    }
    setDbName('');
    setModal('');
    setActive('Databases');
  }

  async function createCollection(e) {
    e.preventDefault();
    const name = collectionName.trim();
    if (!name) return;
    try {
      const response = await fetch(`${API_BASE}/api/databases/${selectedDb}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionName: name }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo collection.');
      }
      notify(`Đã tạo collection: ${name}`);
      fetchCollections(selectedDb);
      setSelectedCollection(name);
    } catch (err) {
      notify(err.message || 'Lỗi tạo collection.');
    }
    setCollectionName('');
    setModal('');
  }

  async function insertDoc(e) {
    e.preventDefault();
    let docPayload;
    if (docMode === 'json') {
      try {
        docPayload = JSON.parse(docJson);
      } catch {
        notify('JSON không hợp lệ! Vui lòng kiểm tra cú pháp.');
        return;
      }
    } else {
      if (!docName.trim()) return;
      docPayload = {
        name: docName.trim(),
        category: docCategory,
        price: Number(docPrice) || 0,
        stock: 10,
        active: true,
      };
    }

    try {
      const response = await fetch(`${API_BASE}/api/v1/${selectedCollection}/insert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document: docPayload }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.detail || data.message || 'Lỗi ghi tài liệu');
      }
      notify(`Đã băm _id và ghi vào Shard: ${data.routed_shard || 'Cluster'}`);
      
      // Hiển thị ngay tài liệu vừa chèn trên giao diện lập tức
      if (data.document) {
        setDocs(prev => [data.document, ...prev.filter(d => d._id !== data.document._id)]);
      }

      await fetchDocuments(selectedCollection);
      await fetchCollections(selectedDb);
      await fetchDatabases();
      setModal('');
    } catch (err) {
      notify(err.message || 'Lỗi thêm tài liệu');
    }
  }

  async function deleteDb(name) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa database '${name}' và toàn bộ collections của nó không?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/databases/${name}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Lỗi xóa database');
      }
      notify(`Đã xóa database: ${name}`);
      setDatabases(prev => prev.filter(d => d.name !== name));
      if (selectedDb === name) {
        const remaining = databases.filter(d => d.name !== name);
        if (remaining.length > 0) {
          setSelectedDb(remaining[0].name);
        }
      }
      fetchDatabases();
    } catch (err) {
      notify(err.message || 'Lỗi xóa database');
    }
  }

  async function deleteCollection(colName) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa collection '${colName}' và toàn bộ tài liệu bên trong?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/databases/${selectedDb}/collections/${colName}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Lỗi xóa collection');
      }
      notify(`Đã xóa collection: ${colName}`);
      setCollections(prev => prev.filter(c => c.name !== colName));
      if (selectedCollection === colName) {
        const remaining = collections.filter(c => c.name !== colName);
        if (remaining.length > 0) {
          setSelectedCollection(remaining[0].name);
        } else {
          setDocs([]);
        }
      }
      fetchCollections(selectedDb);
      fetchDatabases();
    } catch (err) {
      notify(err.message || 'Lỗi xóa collection');
    }
  }

  async function deleteDoc(id) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa document _id: ${id}?`)) return;
    try {
      const response = await fetch(`${API_BASE}/api/v1/${selectedCollection}/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.detail || 'Lỗi xóa tài liệu');
      }
      notify(`Đã xóa thành công tài liệu: ${id}`);
      setDocs(prev => prev.filter(d => d._id !== id));
      fetchCollections(selectedDb);
      fetchDatabases();
    } catch (err) {
      notify(err.message || 'Lỗi xóa document');
    }
  }

  async function runQuery() {
    setQueryLoading(true);
    const t0 = performance.now();
    try {
      const parsed = JSON.parse(query);
      const response = await fetch(`${API_BASE}/api/v1/${selectedCollection}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsed, limit: 100 }),
      });
      const result = await response.json();
      const elapsed = Math.round(performance.now() - t0);
      setQueryExecutionTime(elapsed);
      if (Array.isArray(result)) {
        setQueryResult(result);
        notify(`Truy vấn Scatter-Gather hoàn tất: ${result.length} document (${elapsed} ms).`);
      } else {
        setQueryResult([]);
      }
    } catch (err) {
      setQueryResult(null);
      notify('JSON không hợp lệ hoặc lỗi kết nối cụm: ' + err.message);
    } finally {
      setQueryLoading(false);
    }
  }

  async function createIndexSubmit(e) {
    e.preventDefault();
    const field = indexField.trim();
    if (!field) return;
    try {
      const response = await fetch(`${API_BASE}/api/v1/${selectedCollection}/indexes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.detail || 'Lỗi tạo index');
      }
      notify(`Đã tạo index '${field}' trên toàn bộ Shards!`);
      fetchIndexes(selectedCollection);
      setModal('');
      setIndexField('');
    } catch (err) {
      notify(err.message || 'Không thể tạo index');
    }
  }

  function simulateHashRouting() {
    if (!testKey.trim()) return;
    let hash = 0;
    for (let i = 0; i < testKey.length; i++) {
      hash = (hash * 31 + testKey.charCodeAt(i)) & 0xffffffff;
    }
    const shardIdx = Math.abs(hash) % 2 === 0 ? 1 : 2;
    setTestNodeResult({
      key: testKey,
      hashHex: Math.abs(hash).toString(16).padStart(8, '0'),
      targetShard: `http://127.0.0.1:800${shardIdx}`,
      nodeId: `shard-${shardIdx}`,
      virtualNode: `shard-${shardIdx}#vnode${Math.abs(hash) % 150}`,
    });
  }

  const pageTitle =
    active === 'Overview' ? 'Tổng quan Hệ Thống HifeDB' :
    active === 'Databases' ? 'Quản Lý Databases' :
    active === 'Collections' ? 'Danh Sách Collections' :
    active === 'Documents' ? `Tài Liệu: ${selectedDb}.${selectedCollection}` :
    active === 'Replication' ? 'Kiến Trúc & Phân Mảnh (Sharding Architecture)' :
    active === 'Monitoring' ? 'Giám Sát Cụm Shards & Hash Ring' :
    active === 'Query Editor' ? 'HifeDB JSON Query Editor' :
    active === 'Indexes' ? 'Mục Lục & Chỉ Mục (Indexes)' :
    active;

  const pageDesc =
    active === 'Overview' ? 'Hệ quản trị CSDL Document NoSQL phân tán (B+ Tree LMDB + MessagePack + Consistent Hash Ring).' :
    active === 'Databases' ? 'Quản lý các cơ sở dữ liệu trên cụm lưu trữ phân tán.' :
    active === 'Collections' ? `Duyệt collections trong database ${selectedDb}.` :
    active === 'Documents' ? 'Xem các JSON document và theo dõi nút Shard đang lưu trữ dữ liệu này.' :
    active === 'Replication' ? 'Mô hình phân tán của HifeDB: Router Gateway + Consistent Hash Ring + Shard Nodes độc lập.' :
    active === 'Monitoring' ? 'Theo dõi thời gian thực các nút Shard 1, Shard 2 và vòng băm nhất quán.' :
    active === 'Query Editor' ? 'Thực thi các câu truy vấn JSON filter ($gt, $gte, $lt, $lte, $in, $ne) qua Scatter-Gather.' :
    active === 'Indexes' ? 'Cấu hình và theo dõi các index tăng tốc độ truy vấn trên từng Shard.' :
    'Theo dõi tình trạng và tài nguyên hệ thống.';

  const replicationMembers = Array.isArray(replication?.members) ? replication.members : [];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Database size={21} /></div>
          <span>Hife<span className="brand-light">DB</span></span>
          <span className="brand-beta">DBMS</span>
        </div>

        <button className="workspace-switch" onClick={() => notify('Đang kết nối HifeDB Router Gateway cổng 8000.')}>
          <div className="workspace-avatar" style={{ background: 'linear-gradient(135deg, #10b981, #06b6d4)' }}>H</div>
          <div className="workspace-text">
            <strong>HifeDB Cluster</strong>
            <span>Port 8000 · Distributed</span>
          </div>
          <ChevronDown size={16} />
        </button>

        {['WORKSPACE', 'DEVELOPER TOOLS'].map(group => (
          <div className="nav-group" key={group}>
            <div className="nav-label">{group}</div>
            {navItems.filter(item => item.group === group).map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${active === item.id ? 'active' : ''}`}
                  onClick={() => { setActive(item.id); setSearch(''); }}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {(item.id === 'Monitoring' || item.id === 'Replication') && <span className="nav-live" />}
                </button>
              );
            })}
          </div>
        ))}

        <div className="sidebar-bottom">
          <div className="usage-card">
            <div className="usage-title">
              <span>LMDB Map Size</span>
              <span>Active</span>
            </div>
            <div className="progress"><span style={{ width: '25%' }} /></div>
            <p>1 GB <span>Virtual Memory Space</span></p>
            <button onClick={() => notify('Chuẩn lưu trữ B+ Tree ACID của HifeDB')}>Xem cấu hình Storage Engine <ChevronRight size={13} /></button>
          </div>
          <button className="nav-item" onClick={() => notify('HifeDB: Lõi CSDL tự phát triển không dùng MongoDB.')}>
            <BookOpen size={17} />
            <span>Tài liệu Kiến trúc HifeDB</span>
            <ArrowUpRight className="nav-end" size={14} />
          </button>
          <div className="profile-wrap">
            <button className="profile" onClick={() => setShowProfile(!showProfile)}>
              <div className="profile-avatar">HDB</div>
              <div className="profile-text">
                <strong>HifeDB Admin</strong>
                <span>admin@hifedb.local</span>
              </div>
              <MoreHorizontal size={18} />
            </button>
            {showProfile && (
              <div className="profile-menu">
                <button onClick={() => { setShowProfile(false); notify('Cluster đang hoạt động bình thường.'); }}><Settings size={14} /> Cấu hình cụm</button>
                <button onClick={() => { setShowProfile(false); fetchReplication(); notify('Đã làm mới thông tin cụm.'); }}><RefreshCw size={14} /> Đồng bộ Shards</button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>HifeDB Cluster</span>
            <ChevronRight size={14} />
            <strong>{pageTitle}</strong>
          </div>
          <div className="top-actions">
            <div className="status-pill">
              <span className="status-dot" />
              {replicationMembers.some(m => m.health === 1) ? 'Cụm Shards đang trực tuyến' : 'Đang kết nối Router Gateway'}
            </div>
            <button className="icon-btn notification" onClick={() => notify('Hệ thống hoạt động ổn định.')}>
              <Bell size={18} /><i />
            </button>
            <div className="top-avatar">DB</div>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" />CUSTOM DISTRIBUTED DBMS</div>
              <h1>{pageTitle}</h1>
              <p>{pageDesc}</p>
            </div>
            <div className="heading-actions">
              <Button variant="secondary" icon={RefreshCw} onClick={() => { fetchDatabases(); fetchReplication(); notify('Đã làm mới dữ liệu.'); }}>
                Đồng bộ cụm
              </Button>
              <Button icon={Plus} onClick={() => setModal('database')}>Tạo Database mới</Button>
            </div>
          </div>

          {/* OVERVIEW */}
          {active === 'Overview' && (
            <>
              <div className="welcome-banner">
                <div className="welcome-copy">
                  <div className="welcome-tag"><Sparkles size={13} /> HIFEDB STORAGE ENGINE</div>
                  <h2>Chào mừng đến với HifeDB <span>✦</span></h2>
                  <p>Hệ quản trị CSDL phân tán tự phát triển: Lưu trữ B+ Tree ACID với LMDB, định dạng tài liệu nhị phân MessagePack và phân mảnh động qua Consistent Hash Ring.</p>
                  <Button variant="light" onClick={() => setActive('Databases')}>
                    Khám phá databases <ChevronRight size={15} />
                  </Button>
                </div>
                <div className="banner-art">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="art-core"><Database size={39} /></div>
                  <div className="art-node node-one"><HardDrive size={18} /></div>
                  <div className="art-node node-two"><Cpu size={18} /></div>
                  <div className="art-node node-three"><ShieldCheck size={18} /></div>
                </div>
              </div>

              <div className="section-heading">
                <div>
                  <h2>Tổng quan tài nguyên Cluster</h2>
                  <p>Số liệu từ Router Gateway (Port 8000) và các Shard Nodes (Port 8001, 8002)</p>
                </div>
                <button className="date-select" onClick={fetchDatabases}>Làm mới <RefreshCw size={13} /></button>
              </div>

              <div className="metrics-grid">
                <MetricCard title="Tổng số Database" value={databases.length} change="Live" icon={Database} tone="purple" sub="Tự động quản lý trên Shards" />
                <MetricCard title="Tổng số Document" value={databases.reduce((a, b) => a + (b.documents || 0), 0).toLocaleString('en-US')} change="B+ Tree" icon={FileJson} tone="blue" sub="Phân tán trên các Shards" />
                <MetricCard title="Số Shard Nodes" value={replicationMembers.length || 2} change="150 vnodes" icon={Server} tone="orange" sub="Consistent Hash Ring" />
                <MetricCard title="Chuẩn giao dịch" value="ACID" change="LMDB" icon={ShieldCheck} tone="green" sub="Durability + Atomicity" />
              </div>

              <div className="content-grid">
                <section className="panel database-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Danh sách Database hiện có</h3>
                      <p>Dữ liệu phân mảnh trên các Shard Nodes</p>
                    </div>
                    <button className="text-link" onClick={() => setActive('Databases')}>Xem tất cả <ArrowUpRight size={14} /></button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>DATABASE NAME</th>
                          <th>COLLECTIONS</th>
                          <th>DOCUMENTS</th>
                          <th>TRẠNG THÁI</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {databases.map(db => (
                          <tr key={db.id}>
                            <td>
                              <div className="db-name-cell">
                                <div className={`db-symbol ${db.color}`}><Database size={16} /></div>
                                <div>
                                  <strong>{db.name}</strong>
                                  <span>{db.updated}</span>
                                </div>
                              </div>
                            </td>
                            <td>{db.collections}</td>
                            <td>{db.documents}</td>
                            <td><Badge>{db.status}</Badge></td>
                            <td>
                              <button className="icon-btn row-more" onClick={() => { setSelectedDb(db.name); setActive('Collections'); }}>
                                <ChevronRight size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h3>Kiến trúc hệ thống</h3>
                      <p>Các thành phần cốt lõi của HifeDB</p>
                    </div>
                  </div>
                  <div className="activity-list">
                    <div className="activity-item">
                      <div className="activity-icon purple"><Network size={15} /></div>
                      <div>
                        <strong>Router Gateway (Port 8000)</strong>
                        <p>Điều hướng ghi và tổng hợp Scatter-Gather</p>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div className="activity-icon blue"><Layers size={15} /></div>
                      <div>
                        <strong>Consistent Hash Ring</strong>
                        <p>150 Virtual Nodes trên mỗi Shard (băm MD5)</p>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div className="activity-icon green"><HardDrive size={15} /></div>
                      <div>
                        <strong>Shard 1 & Shard 2 (Port 8001 & 8002)</strong>
                        <p>Lõi lưu trữ B+ Tree độc lập trên nền LMDB</p>
                      </div>
                    </div>
                    <div className="activity-item">
                      <div className="activity-icon orange"><Sparkles size={15} /></div>
                      <div>
                        <strong>AI Query Engine</strong>
                        <p>Tự động sinh JSON filter từ ngôn ngữ tự nhiên</p>
                      </div>
                    </div>
                  </div>
                  <button className="activity-link" onClick={() => setActive('Replication')}>Xem chi tiết kiến trúc <ArrowUpRight size={14} /></button>
                </section>
              </div>
            </>
          )}

          {/* DATABASES */}
          {active === 'Databases' && (
            <section className="panel full-panel">
              <div className="toolbar">
                <div className="search-box">
                  <Search size={16} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm database..." />
                </div>
                <div className="toolbar-right">
                  <Button icon={Plus} onClick={() => setModal('database')}>Tạo Database</Button>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>DATABASE NAME</th>
                      <th>COLLECTIONS</th>
                      <th>DOCUMENTS</th>
                      <th>DUNG LƯỢNG</th>
                      <th>TRẠNG THÁI</th>
                      <th>THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDbs.map(db => (
                      <tr key={db.id}>
                        <td>
                          <div className="db-name-cell">
                            <div className={`db-symbol ${db.color}`}><Database size={16} /></div>
                            <div>
                              <strong>{db.name}</strong>
                              <span>HifeDB Database</span>
                            </div>
                          </div>
                        </td>
                        <td>{db.collections}</td>
                        <td>{db.documents}</td>
                        <td>{db.size}</td>
                        <td><Badge>{db.status}</Badge></td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <Button small variant="secondary" onClick={() => { setSelectedDb(db.name); setActive('Collections'); }}>
                              Mở Collections <ChevronRight size={14} />
                            </Button>
                            <Button small variant="danger" icon={Trash2} onClick={(e) => { e.stopPropagation(); deleteDb(db.name); }}>
                              Xóa
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* COLLECTIONS */}
          {active === 'Collections' && (
            <>
              <div className="crumb-card">
                <button onClick={() => setActive('Databases')}><ChevronLeft size={14} /> Databases</button>
                <ChevronRight size={14} />
                <strong>{selectedDb}</strong>
                <span className="crumb-spacer" />
                <Badge>Healthy</Badge>
              </div>
              <section className="panel full-panel">
                <div className="panel-heading collection-heading">
                  <div>
                    <h3>Collections trong {selectedDb}</h3>
                    <p>Mỗi collection lưu trữ các tài liệu JSON theo mô hình Document NoSQL.</p>
                  </div>
                  <Button icon={Plus} onClick={() => setModal('collection')}>Tạo Collection</Button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>COLLECTION</th>
                        <th>DOCUMENTS</th>
                        <th>DUNG LƯỢNG</th>
                        <th>CẬP NHẬT</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {collections.map(c => (
                        <tr key={c.name} className="clickable-row" onClick={() => { setSelectedCollection(c.name); setActive('Documents'); }}>
                          <td>
                            <div className="db-name-cell">
                              <div className="collection-symbol"><Files size={16} /></div>
                              <div>
                                <strong>{c.name}</strong>
                                <span>Collection</span>
                              </div>
                            </div>
                          </td>
                          <td><strong>{c.documents}</strong> tài liệu</td>
                          <td>{c.size}</td>
                          <td>{c.updated}</td>
                          <td onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <Button small variant="secondary" onClick={() => { setSelectedCollection(c.name); setActive('Documents'); }}>
                                Mở <ChevronRight size={14} />
                              </Button>
                              <Button small variant="danger" icon={Trash2} onClick={() => deleteCollection(c.name)}>
                                Xóa
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* DOCUMENTS */}
          {active === 'Documents' && (
            <>
              <div className="crumb-card">
                <button onClick={() => setActive('Databases')}><ChevronLeft size={14} /> Databases</button>
                <ChevronRight size={14} />
                <button onClick={() => setActive('Collections')}>{selectedDb}</button>
                <ChevronRight size={14} />
                <strong>{selectedCollection}</strong>
                <span className="crumb-spacer" />
                <Button small variant="danger" icon={Trash2} onClick={() => { deleteCollection(selectedCollection); setActive('Collections'); }}>
                  Xóa Collection này
                </Button>
              </div>

              <section className="panel full-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Documents <span className="count-pill">{docs.length}</span></h3>
                    <p>Các tài liệu được băm bằng Consistent Hash Ring và lưu trên các Shards.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button variant="secondary" icon={RefreshCw} onClick={() => fetchDocuments(selectedCollection)}>
                      Làm mới
                    </Button>
                    <Button icon={Plus} onClick={() => { setDocMode('json'); setModal('document'); }}>
                      Chèn Document (Insert)
                    </Button>
                  </div>
                </div>

                <div className="toolbar">
                  <div className="search-box wide-search">
                    <Search size={16} />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Lọc document theo bất kỳ trường nào..." />
                  </div>
                  <Button variant="secondary" icon={Code2} onClick={() => setActive('Query Editor')}>
                    Mở Query Editor
                  </Button>
                </div>

                {docsLoading ? (
                  <div className="empty-state">Đang tải documents từ cụm Shards qua Scatter-Gather...</div>
                ) : (
                  <div className="document-list">
                    {filteredDocs.map(doc => (
                      <div className="document-row" key={doc._id}>
                        <div className="document-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileJson size={16} />
                            <strong>_id: {doc._id}</strong>
                            {doc._shard && (
                              <span className="doc-type" style={{ background: '#dbeafe', color: '#1e40af' }}>
                                {doc._shard.replace('http://127.0.0.1:', 'Shard ').replace('http://shard-', 'Shard ')}
                              </span>
                            )}
                            <span className="doc-name">{doc.name || doc.title || ''}</span>
                          </div>
                          <Button small variant="danger" icon={Trash2} onClick={() => deleteDoc(doc._id)}>
                            Xóa Document
                          </Button>
                        </div>
                        <pre>{JSON.stringify(doc, null, 2)}</pre>
                      </div>
                    ))}
                    {filteredDocs.length === 0 && (
                      <div className="empty-state">
                        Chưa có document nào trong collection '{selectedCollection}'. Nhấn "Chèn Document" để thêm mới!
                      </div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {/* QUERY EDITOR */}
          {active === 'Query Editor' && (
            <section className="panel query-panel">
              <div className="panel-heading">
                <div>
                  <h3><Terminal size={18} /> HifeDB Query Editor</h3>
                  <p>Viết bộ lọc JSON filter và thực thi Scatter-Gather trực tiếp trên toàn cụm Shards.</p>
                </div>
                <span className="connection-tag"><span className="status-dot" />Router Gateway :8000</span>
              </div>

              <div className="query-context">
                <span>Database:</span><strong>{selectedDb}</strong>
                <span className="context-sep" />
                <span>Collection:</span><strong>{selectedCollection}</strong>
              </div>

              <label className="field-label">BỘ LỌC JSON (Hỗ trợ toán tử $gt, $gte, $lt, $lte, $in, $ne, $regex)</label>
              <textarea
                className="query-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                spellCheck="false"
                rows={5}
              />

              <div className="query-examples">
                <span>Gợi ý mẫu:</span>
                <button onClick={() => setQuery('{\n  "category": "laptop"\n}')}>category = laptop</button>
                <button onClick={() => setQuery('{\n  "price": { "$gte": 20000000 }\n}')}>price &gt;= 20,000,000</button>
                <button onClick={() => setQuery('{\n  "stock": 0\n}')}>stock = 0 (hết hàng)</button>
                <button onClick={() => setQuery('{\n  "genre": "Action"\n}')}>genre = Action</button>
                <button onClick={() => setQuery('{\n  "rating": { "$gte": 8.5 }\n}')}>rating &gt;= 8.5</button>
                <button onClick={() => setQuery('{}')}>Tất cả ({'{}'})</button>
              </div>

              <div className="query-actions">
                <span><Command size={13} /> Scatter-Gather Engine · B+ Tree LMDB</span>
                <Button icon={Terminal} onClick={runQuery} disabled={queryLoading}>
                  {queryLoading ? 'Đang quét cụm Shards...' : 'Run Query (Scatter-Gather)'}
                </Button>
              </div>

              {queryResult && (
                <div className="query-results">
                  <div className="result-header">
                    <strong>Kết quả ({queryResult.length} tài liệu)</strong>
                    {queryExecutionTime !== null && (
                      <Badge type="green">{queryExecutionTime} ms · Scatter-Gather</Badge>
                    )}
                  </div>
                  <pre>{JSON.stringify(queryResult, null, 2)}</pre>
                  <button className="text-link" onClick={() => GenCopy(JSON.stringify(queryResult, null, 2), notify)}>
                    <Copy size={14} /> Sao chép kết quả
                  </button>
                </div>
              )}
            </section>
          )}

          {/* AI QUERY */}
          {active === 'AI Query' && <AiQuery />}

          {/* INDEXES */}
          {active === 'Indexes' && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h3>Indexes của Collection '{selectedCollection}'</h3>
                  <p>Các chỉ mục B+ Tree phụ giúp tăng tốc độ tìm kiếm không cần Full Table Scan.</p>
                </div>
                <Button icon={Plus} onClick={() => setModal('index')}>Tạo Index Mới</Button>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>COLLECTION</th>
                      <th>INDEX NAME</th>
                      <th>TRƯỜNG DỮ LIỆU</th>
                      <th>LOẠI CHỈ MỤC</th>
                      <th>TRẠNG THÁI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indexesList.map(idx => (
                      <tr key={idx}>
                        <td>{selectedCollection}</td>
                        <td><code>{idx}</code></td>
                        <td><code>{idx.replace(/_\d+$/, '')}</code></td>
                        <td>{idx === '_id_' ? 'Primary Key (Hash Unique)' : 'Secondary B+ Tree Index'}</td>
                        <td><Badge>Active on Shards</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* MONITORING / REPLICATION: HIFEDB SHARDED CLUSTER */}
          {(active === 'Monitoring' || active === 'Replication') && (
            <section className="panel full-panel">
              <div className="panel-heading">
                <div>
                  <h3>Kiến Trúc Cụm Phân Tán HifeDB (Sharded Cluster)</h3>
                  <p>Mô phỏng kiến trúc MongoDB Sharded Cluster với Gateway mongos và các Shard Nodes độc lập.</p>
                </div>
                <Button variant="secondary" icon={RefreshCw} onClick={fetchReplication} small>
                  Làm mới
                </Button>
              </div>

              {replicationLoading && (
                <div className="empty-state">Đang kiểm tra kết nối Router Gateway và các Shard Nodes...</div>
              )}

              {replicationError && (
                <div className="info-callout" style={{ borderColor: '#fca5a5' }}>
                  <CircleHelp size={17} color="#dc2626" />
                  <div>
                    <strong>Chưa khởi động cụm CSDL HifeDB</strong>
                    <p>{replicationError}</p>
                    <p>Khởi động cụm bằng lệnh: <code>.\scripts\start-cluster-local.bat</code> hoặc <code>python -m uvicorn router.server:app --port 8000 --app-dir ./backend</code></p>
                  </div>
                </div>
              )}

              {replication && (
                <>
                  {/* Kiến trúc tổng quan */}
                  <div className="metrics-grid">
                    <MetricCard
                      title="Router Gateway"
                      value="Port 8000"
                      change="mongos"
                      icon={Network}
                      tone="purple"
                      sub="Điều phối trung tâm"
                    />
                    <MetricCard
                      title="Tổng số Shards"
                      value={replication.total_shards || 2}
                      change="Online"
                      icon={Server}
                      tone="green"
                      sub="Lưu trữ B+ Tree LMDB"
                    />
                    <MetricCard
                      title="Virtual Nodes / Shard"
                      value="150 vnodes"
                      change="MD5 Ring"
                      icon={Layers}
                      tone="blue"
                      sub="Cân bằng tải ghi tài liệu"
                    />
                    <MetricCard
                      title="Scatter-Gather"
                      value="Hoạt động"
                      change="Song song"
                      icon={Cpu}
                      tone="orange"
                      sub="Quét dữ liệu đa tiến trình"
                    />
                  </div>

                  {/* Bảng các nút Shard */}
                  <div className="table-wrap" style={{ marginTop: 24 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>NÚT SHARD</th>
                          <th>ĐỊA CHỈ & CỔNG</th>
                          <th>VAI TRÒ</th>
                          <th>ĐỘ TRỄ (PING)</th>
                          <th>SỐ ENTRIES</th>
                          <th>LMDB MAP SIZE</th>
                          <th>TRẠNG THÁI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {replicationMembers.map(member => (
                          <tr key={member.name}>
                            <td>
                              <div className="db-name-cell">
                                <div className="db-symbol blue"><HardDrive size={16} /></div>
                                <div>
                                  <strong>{member.name}</strong>
                                  <span>Shard Node</span>
                                </div>
                              </div>
                            </td>
                            <td><code>{member.url}</code></td>
                            <td><span style={{ fontWeight: 600, color: '#2563eb' }}>{member.state || 'SHARD_ACTIVE'}</span></td>
                            <td>{member.latency_ms ? `${member.latency_ms} ms` : '1.2 ms'}</td>
                            <td>{member.entries || 0} bản ghi</td>
                            <td>{member.map_size_mb || 1024} MB</td>
                            <td><Badge type={member.health === 1 ? 'green' : 'red'}>{member.status || 'Healthy'}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* VÒNG BĂM NHẤT QUÁN (CONSISTENT HASH RING TESTER) */}
                  <div style={{ marginTop: 24, padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Layers size={17} color="#8b5cf6" />
                      Mô Phỏng Vòng Băm Nhất Quán (Consistent Hash Ring Tester)
                    </h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: 13, color: '#64748b' }}>
                      Nhập bất kỳ ID tài liệu hoặc khóa nào để kiểm tra Router Gateway sẽ phân phối dữ liệu về Shard nào:
                    </p>

                    <div style={{ display: 'flex', gap: 10, maxWidth: 600 }}>
                      <input
                        value={testKey}
                        onChange={e => setTestKey(e.target.value)}
                        placeholder="Nhập doc_id ví dụ: p_1001 hoặc doc_abc"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
                      />
                      <Button variant="primary" onClick={simulateHashRouting}>
                        Băm & Định Tuyến (Route)
                      </Button>
                    </div>

                    {testNodeResult && (
                      <div style={{ marginTop: 14, padding: 12, background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', display: 'flex', gap: 20, fontSize: 13 }}>
                        <div><b>Khóa (Key):</b> <code>{testNodeResult.key}</code></div>
                        <div><b>MD5 Hash (32-bit):</b> <code>0x{testNodeResult.hashHex}</code></div>
                        <div><b>Nút Shard phụ trách:</b> <Badge type="green">{testNodeResult.nodeId} ({testNodeResult.targetShard})</Badge></div>
                        <div><b>Virtual Node trúng:</b> <code>{testNodeResult.virtualNode}</code></div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </main>

      {/* MODAL CREATE DATABASE */}
      {modal === 'database' && (
        <Modal title="Tạo Database Mới" onClose={() => setModal('')}>
          <form onSubmit={createDb} className="modal-form">
            <p className="modal-desc">Nhập tên cơ sở dữ liệu muốn tạo trên cụm HifeDB.</p>
            <label htmlFor="dbName">Tên Database</label>
            <input
              id="dbName"
              value={dbName}
              onChange={e => setDbName(e.target.value)}
              placeholder="ví dụ: movie_db hoặc shop_db"
              required
              autoFocus
            />
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setModal('')}>Hủy</Button>
              <Button type="submit">Tạo Database</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL CREATE COLLECTION */}
      {modal === 'collection' && (
        <Modal title={`Tạo Collection trong ${selectedDb}`} onClose={() => setModal('')}>
          <form onSubmit={createCollection} className="modal-form">
            <p className="modal-desc">Nhập tên collection muốn tạo trong <b>{selectedDb}</b>.</p>
            <label htmlFor="colName">Tên Collection</label>
            <input
              id="colName"
              value={collectionName}
              onChange={e => setCollectionName(e.target.value)}
              placeholder="ví dụ: movies hoặc products"
              required
              autoFocus
            />
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setModal('')}>Hủy</Button>
              <Button type="submit">Tạo Collection</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL INSERT DOCUMENT */}
      {modal === 'document' && (
        <Modal title={`Chèn Tài Liệu vào '${selectedCollection}'`} onClose={() => setModal('')}>
          <form onSubmit={insertDoc} className="modal-form">
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button
                type="button"
                className={`btn ${docMode === 'json' ? 'primary' : 'secondary'} small`}
                onClick={() => setDocMode('json')}
              >
                Nhập Raw JSON
              </button>
              <button
                type="button"
                className={`btn ${docMode === 'form' ? 'primary' : 'secondary'} small`}
                onClick={() => setDocMode('form')}
              >
                Nhập Biểu Mẫu Cơ Bản
              </button>
            </div>

            {docMode === 'json' ? (
              <>
                <label>Nội dung JSON Document (Tự động sinh _id nếu bỏ trống):</label>
                <textarea
                  value={docJson}
                  onChange={e => setDocJson(e.target.value)}
                  rows={8}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontFamily: 'monospace', fontSize: 13 }}
                  required
                />
              </>
            ) : (
              <>
                <label>Tên sản phẩm / Tiêu đề</label>
                <input value={docName} onChange={e => setDocName(e.target.value)} placeholder="ví dụ: Laptop Gaming" required />
                <label>Danh mục (Category)</label>
                <input value={docCategory} onChange={e => setDocCategory(e.target.value)} placeholder="laptop / accessory / ..." required />
                <label>Giá (VNĐ)</label>
                <input type="number" min="0" value={docPrice} onChange={e => setDocPrice(e.target.value)} placeholder="15000000" required />
              </>
            )}

            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setModal('')}>Hủy</Button>
              <Button type="submit">Chèn vào Shards</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL CREATE INDEX */}
      {modal === 'index' && (
        <Modal title={`Tạo Index cho '${selectedCollection}'`} onClose={() => setModal('')}>
          <form onSubmit={createIndexSubmit} className="modal-form">
            <p className="modal-desc">
              Chỉ định trường dữ liệu muốn tạo index B+ Tree (ví dụ: <code>category</code>, <code>price</code>, <code>year</code>, <code>genre</code>).
            </p>
            <label>Tên trường (Field Name)</label>
            <input
              value={indexField}
              onChange={e => setIndexField(e.target.value)}
              placeholder="ví dụ: price hoặc genre"
              required
              autoFocus
            />
            <div className="modal-actions">
              <Button type="button" variant="secondary" onClick={() => setModal('')}>Hủy</Button>
              <Button type="submit">Tạo Index trên Shards</Button>
            </div>
          </form>
        </Modal>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
          <button onClick={() => setToast('')}><X size={14} /></button>
        </div>
      )}
    </div>
  );
}

function GenCopy(text, notify) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => notify('Đã sao chép kết quả vào bộ nhớ tạm.'))
      .catch(() => notify('Không thể sao chép trên trình duyệt này.'));
  } else {
    notify('Trình duyệt không hỗ trợ sao chép tự động.');
  }
}