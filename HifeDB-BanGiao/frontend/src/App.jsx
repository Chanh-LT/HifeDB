
import React, { useEffect, useMemo, useState } from 'react';
import AiQuery from './AiQuery';
import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, BookOpen, Check, ChevronDown,
  ChevronLeft, ChevronRight, CircleHelp, Code2, Command, Copy, Database,
  FileJson, Files, Gauge, HardDrive, LayoutDashboard, ListFilter, LogOut,
  MoreHorizontal, Plus, Search, Settings, ShieldCheck, Sparkles, Terminal,
  Trash2, X, Zap, RefreshCw,
} from 'lucide-react';

const initialDbs = [
  { id: 1, name: 'shop_db', collections: 4, documents: 1284, size: '24.8 MB', status: 'Healthy', updated: '2 phút trước', color: 'purple' },
  { id: 2, name: 'student_db', collections: 3, documents: 856, size: '12.1 MB', status: 'Healthy', updated: '18 phút trước', color: 'blue' },
  { id: 3, name: 'analytics_db', collections: 2, documents: 4210, size: '86.4 MB', status: 'Healthy', updated: '1 giờ trước', color: 'orange' },
];
const initialCollections = [
  { name: 'products', documents: 482, size: '8.2 MB', index: 3, updated: '2 phút trước' },
  { name: 'customers', documents: 218, size: '4.7 MB', index: 2, updated: '12 phút trước' },
  { name: 'orders', documents: 391, size: '9.1 MB', index: 4, updated: '24 phút trước' },
  { name: 'categories', documents: 193, size: '2.8 MB', index: 1, updated: '1 giờ trước' },
];
const initialDocs = [
  { _id: 'p_1001', name: 'MacBook Air M3', category: 'laptop', price: 27990000, stock: 14, active: true },
  { _id: 'p_1002', name: 'Chuột Logitech MX', category: 'accessory', price: 1890000, stock: 38, active: true },
  { _id: 'p_1003', name: 'Màn hình Dell 27 inch', category: 'monitor', price: 7290000, stock: 9, active: true },
  { _id: 'p_1004', name: 'Bàn phím cơ Keychron', category: 'accessory', price: 2490000, stock: 0, active: false },
  { _id: 'p_1005', name: 'Laptop Lenovo ThinkPad', category: 'laptop', price: 21990000, stock: 6, active: true },
];

const navItems = [
  { id: 'Overview', label: 'Tổng quan', icon: LayoutDashboard, group: 'WORKSPACE' },
  { id: 'Databases', label: 'Databases', icon: Database, group: 'WORKSPACE' },
  { id: 'Collections', label: 'Collections', icon: Files, group: 'WORKSPACE' },
  {
  id: 'Documents',
  label: 'Documents',
  icon: FileJson,
  group: 'WORKSPACE'
},
  { id: 'Query Editor', label: 'Query Editor', icon: Terminal, group: 'DEVELOPER TOOLS' },
  {
  id: 'AI Query',
  label: 'AI Query',
  icon: Sparkles,
  group: 'DEVELOPER TOOLS'
},
  { id: 'Indexes', label: 'Indexes', icon: Zap, group: 'DEVELOPER TOOLS' },
  { id: 'Monitoring', label: 'Giám sát', icon: Activity, group: 'DEVELOPER TOOLS' },
  { id: 'Replication', label: 'Replication', icon: Database, group: 'DEVELOPER TOOLS' },
];

function Button({
  children,
  variant = 'primary',
  onClick,
  icon: Icon,
  small = false,
  type = 'button'
}) {
  return (
    <button
      type={type}
      className={`btn ${variant} ${small ? 'small' : ''}`}
      onClick={onClick}
    >
      {Icon && <Icon size={small ? 14 : 16} />}
      {children}
    </button>
  );
}
function Badge({ children, type = 'green' }) { return <span className={`badge ${type}`}><span className="dot" />{children}</span>; }
function MetricCard({ title, value, change, icon: Icon, tone, sub }) {
  return <div className="metric-card">
    <div className="metric-top"><span>{title}</span><span className={`metric-icon ${tone}`}><Icon size={18}/></span></div>
    <div className="metric-value">{value}</div>
    <div className="metric-bottom"><span className="change"><ArrowUpRight size={14}/>{change}</span><span>{sub}</span></div>
  </div>;
}
function Modal({ title, onClose, children }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e => e.stopPropagation()}>
    <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}
  </div></div>;
}

export default function App() {
  const [active, setActive] = useState('Overview');
  const [databases, setDatabases] = useState(initialDbs);
  const [collections] = useState(initialCollections);
  const [docs, setDocs] = useState(initialDocs);
  const [selectedDb, setSelectedDb] = useState('shop_db');
  const [selectedCollection, setSelectedCollection] = useState('products');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('{ "category": "laptop" }');
  const [queryResult, setQueryResult] = useState(null);
  const [modal, setModal] = useState('');
  const [dbName, setDbName] = useState('');
  const [docName, setDocName] = useState('');
  const [docPrice, setDocPrice] = useState('');
  const [toast, setToast] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  
const [replication, setReplication] = useState(null);
const [replicationLoading, setReplicationLoading] = useState(false);
const [replicationError, setReplicationError] = useState('');


async function fetchReplication() {
  setReplicationLoading(true);
  setReplicationError('');

  try {
    const response = await fetch(
      'http://localhost:3001/api/replication-status'
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || data.message || `HTTP ${response.status}`
      );
    }

    if (
      !data.success ||
      !Array.isArray(data.members)
    ) {
      throw new Error(
        data.error ||
        data.message ||
        'Dữ liệu Replication không đúng định dạng.'
      );
    }

    setReplication(data);
  } catch (error) {
    setReplicationError(
      error.message || 'Không thể kết nối backend.'
    );
    setReplication(null);
  } finally {
    setReplicationLoading(false);
  }
}



  const filteredDbs = useMemo(() => databases.filter(db => db.name.toLowerCase().includes(search.toLowerCase())), [databases, search]);
  const filteredDocs = useMemo(() => docs.filter(doc => Object.values(doc).some(v => String(v).toLowerCase().includes(search.toLowerCase()))), [docs, search]);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }
  function createDb(e) {
    e.preventDefault();
    const name = dbName.trim();
    if (!name) return;
    if (databases.some(d => d.name === name)) { notify('Database đã tồn tại.'); return; }
    setDatabases(prev => [...prev, { id: Date.now(), name, collections: 0, documents: 0, size: '0 MB', status: 'Healthy', updated: 'Vừa tạo', color: 'blue' }]);
    setDbName(''); setModal(''); setActive('Databases'); notify('Đã tạo database mẫu.');
  }
  function addDoc(e) {
    e.preventDefault();
    if (!docName.trim() || !docPrice) return;
    setDocs(prev => [{ _id: `p_${Date.now().toString().slice(-4)}`, name: docName.trim(), category: 'new', price: Number(docPrice), stock: 1, active: true }, ...prev]);
    setDocName(''); setDocPrice(''); setModal(''); notify('Đã thêm document mẫu.');
  }
  function runQuery() {
    try {
      const parsed = JSON.parse(query);
      const result = docs.filter(doc => Object.entries(parsed).every(([k,v]) => doc[k] === v));
      setQueryResult(result); notify(`Truy vấn mẫu hoàn tất: ${result.length} document.`);
    } catch {
      setQueryResult(null); notify('JSON chưa hợp lệ. Hãy kiểm tra cú pháp.');
    }
  }
  function deleteDoc(id) {
    setDocs(prev => prev.filter(doc => doc._id !== id));
    notify('Đã xóa document mẫu.');
  }
  const pageTitle =
  active === 'Overview' ? 'Tổng quan' :
  active === 'Databases' ? 'Databases' :
  active === 'Collections' ? 'Collections' :
  active === 'Replication' ? 'Replication Monitoring' :
  active;
  const pageDesc =
  active === 'Overview' ? 'Theo dõi và quản lý tài nguyên database của bạn.' :
  active === 'Databases' ? 'Tạo và quản lý các database trong workspace.' :
  active === 'Collections' ? 'Duyệt collections và documents của database.' :
  active === 'Replication' ? 'Theo dõi trạng thái các node MongoDB Replica Set.' :
  active === 'Query Editor' ? 'Thử nghiệm truy vấn dữ liệu bằng bộ lọc JSON.' :
  active === 'Indexes' ? 'Theo dõi các chỉ mục được cấu hình cho collection.' :
  'Theo dõi tình trạng và mức sử dụng tài nguyên.';
const replicationMembers = Array.isArray(replication?.members)
  ? replication.members
  : [];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Database size={21}/></div><span>Hife<span className="brand-light">db</span></span><span className="brand-beta">BETA</span></div>
      <button className="workspace-switch" onClick={() => notify('Workspace cá nhân đang được chọn.')}><div className="workspace-avatar">P</div><div className="workspace-text"><strong>Personal Workspace</strong><span>Free plan</span></div><ChevronDown size={16}/></button>
      {['WORKSPACE', 'DEVELOPER TOOLS'].map(group => <div className="nav-group" key={group}><div className="nav-label">{group}</div>{navItems.filter(item => item.group === group).map(item => {
        const Icon = item.icon;
        return <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => { setActive(item.id); setSearch(''); }}>
          <Icon size={17}/><span>{item.label}</span>{item.id === 'Monitoring' && <span className="nav-live"/>}
        </button>;
      })}</div>)}
      <div className="sidebar-bottom">
        <div className="usage-card"><div className="usage-title"><span>Storage usage</span><span>12%</span></div><div className="progress"><span style={{width:'12%'}}/></div><p>120 MB <span>of 1 GB used</span></p><button onClick={() => notify('Thông tin gói dịch vụ mẫu.')}>View plan details <ChevronRight size={13}/></button></div>
        <button className="nav-item" onClick={() => notify('Tài liệu sẽ được bổ sung sau.')}><BookOpen size={17}/><span>Tài liệu</span><ArrowUpRight className="nav-end" size={14}/></button>
        <button className="nav-item" onClick={() => notify('Trung tâm trợ giúp mẫu.')}><CircleHelp size={17}/><span>Trợ giúp</span></button>
        <div className="profile-wrap"><button className="profile" onClick={() => setShowProfile(!showProfile)}><div className="profile-avatar">PH</div><div className="profile-text"><strong>Phuc Nguyen</strong><span>phuc@example.com</span></div><MoreHorizontal size={18}/></button>{showProfile && <div className="profile-menu"><button onClick={() => {setShowProfile(false); notify('Trang cài đặt sẽ được bổ sung.')}}><Settings size={14}/> Cài đặt tài khoản</button><button onClick={() => {setShowProfile(false); notify('Đây là giao diện demo, chưa có đăng xuất thật.')}}><LogOut size={14}/> Đăng xuất</button></div>}</div>
      </div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{pageTitle}</strong></div>
        <div className="top-actions"><div className="status-pill"><span className="status-dot"/>All systems operational</div><button className="icon-btn notification" onClick={() => notify('Bạn chưa có thông báo mới.')}><Bell size={18}/><i/></button><div className="top-avatar">PH</div></div>
      </header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>DATABASE PLATFORM</div><h1>{pageTitle}</h1><p>{pageDesc}</p></div><div className="heading-actions"><Button variant="secondary" icon={BookOpen} onClick={() => notify('Tài liệu hướng dẫn sẽ được cập nhật.')}>Documentation</Button><Button icon={Plus} onClick={() => setModal('database')}>New database</Button></div></div>

        {active === 'Overview' && <>
          <div className="welcome-banner"><div className="welcome-copy"><div className="welcome-tag"><Sparkles size={13}/> YOUR CLOUD WORKSPACE</div><h2>Chào mừng trở lại, Phuc <span>✦</span></h2><p>Database của bạn đang hoạt động ổn định. Hãy tiếp tục xây dựng điều tuyệt vời.</p><Button variant="light" onClick={() => setActive('Databases')}>Khám phá databases <ChevronRight size={15}/></Button></div><div className="banner-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="art-core"><Database size={39}/></div><div className="art-node node-one"><HardDrive size={18}/></div><div className="art-node node-two"><Code2 size={18}/></div><div className="art-node node-three"><ShieldCheck size={18}/></div></div></div>
          <div className="section-heading"><div><h2>Workspace overview</h2><p>Tổng quan tài nguyên của bạn</p></div><button className="date-select" onClick={() => notify('Hiển thị dữ liệu demo trong 7 ngày gần nhất.')}>Last 7 days <ChevronDown size={14}/></button></div>
          <div className="metrics-grid"><MetricCard title="Total databases" value={databases.length} change="+1" icon={Database} tone="purple" sub="so với tuần trước"/><MetricCard title="Total documents" value={databases.reduce((a,b)=>a+b.documents,0).toLocaleString('en-US')} change="+12.8%" icon={FileJson} tone="blue" sub="so với tuần trước"/><MetricCard title="Storage used" value="123.3 MB" change="+4.2%" icon={HardDrive} tone="orange" sub="so với tuần trước"/><MetricCard title="Query performance" value="24 ms" change="−8.1%" icon={Gauge} tone="green" sub="thời gian trung bình"/></div>
          <div className="content-grid"><section className="panel database-panel"><div className="panel-heading"><div><h3>Recent databases</h3><p>Các database được truy cập gần đây</p></div><button className="text-link" onClick={() => setActive('Databases')}>View all <ArrowUpRight size={14}/></button></div><div className="table-wrap"><table><thead><tr><th>DATABASE NAME</th><th>COLLECTIONS</th><th>DOCUMENTS</th><th>STATUS</th><th></th></tr></thead><tbody>{databases.slice(0,4).map(db => <tr key={db.id}><td><div className="db-name-cell"><div className={`db-symbol ${db.color}`}><Database size={16}/></div><div><strong>{db.name}</strong><span>Updated {db.updated}</span></div></div></td><td>{db.collections}</td><td>{db.documents.toLocaleString('en-US')}</td><td><Badge>{db.status}</Badge></td><td><button className="icon-btn row-more" onClick={() => {setSelectedDb(db.name);setActive('Collections')}}><ChevronRight size={16}/></button></td></tr>)}</tbody></table></div><div className="panel-footer"><span>Showing {databases.length} databases</span><button className="text-link" onClick={() => setActive('Databases')}>Manage databases <ChevronRight size={14}/></button></div></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h3>System activity</h3><p>Hoạt động gần đây</p></div><button className="icon-btn" onClick={() => notify('Đã cập nhật danh sách hoạt động mẫu.')}><MoreHorizontal size={18}/></button></div><div className="activity-list"><div className="activity-item"><div className="activity-icon purple"><Plus size={15}/></div><div><strong>Database created</strong><p><b>shop_db</b> was created</p><span>2 minutes ago</span></div></div><div className="activity-item"><div className="activity-icon blue"><Zap size={15}/></div><div><strong>Index created</strong><p>Index added to <b>products</b></p><span>18 minutes ago</span></div></div><div className="activity-item"><div className="activity-icon green"><Check size={15}/></div><div><strong>Backup completed</strong><p>Automatic backup successful</p><span>1 hour ago</span></div></div><div className="activity-item"><div className="activity-icon orange"><Activity size={15}/></div><div><strong>Query executed</strong><p>Query completed in <b>24 ms</b></p><span>2 hours ago</span></div></div></div><button className="activity-link" onClick={() => setActive('Monitoring')}>View activity log <ArrowUpRight size={14}/></button></section></div>
          <div className="bottom-tip"><div className="tip-icon"><Zap size={17}/></div><div><strong>Make your queries faster</strong><p>Indexes giúp truy vấn dữ liệu hiệu quả hơn. Xem các index đang sử dụng trong workspace.</p></div><button className="text-link" onClick={() => setActive('Indexes')}>Explore indexes <ChevronRight size={14}/></button></div>
        </>}

        {active === 'Databases' && <section className="panel full-panel"><div className="toolbar"><div className="search-box"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm database..."/><kbd>⌘ K</kbd></div><div className="toolbar-right"><Button variant="secondary" icon={ListFilter} onClick={() => notify('Đang hiển thị tất cả trạng thái.')}>Filter</Button><Button icon={Plus} onClick={() => setModal('database')}>New database</Button></div></div><div className="table-wrap"><table><thead><tr><th>DATABASE NAME</th><th>COLLECTIONS</th><th>DOCUMENTS</th><th>STORAGE</th><th>STATUS</th><th>UPDATED</th><th></th></tr></thead><tbody>{filteredDbs.map(db=><tr key={db.id}><td><div className="db-name-cell"><div className={`db-symbol ${db.color}`}><Database size={16}/></div><div><strong>{db.name}</strong><span>Database</span></div></div></td><td>{db.collections}</td><td>{db.documents.toLocaleString('en-US')}</td><td>{db.size}</td><td><Badge>{db.status}</Badge></td><td>{db.updated}</td><td><button className="icon-btn" onClick={()=>{setSelectedDb(db.name);setActive('Collections')}}><ChevronRight size={16}/></button></td></tr>)}</tbody></table>{filteredDbs.length===0&&<div className="empty-state">Không tìm thấy database phù hợp.</div>}</div><div className="panel-footer"><span>{filteredDbs.length} database(s)</span><span>Dữ liệu minh họa · Chưa kết nối backend</span></div></section>}

        {active === 'Collections' && <><div className="crumb-card"><button onClick={()=>setActive('Databases')}><ChevronLeft size={14}/> Databases</button><ChevronRight size={14}/><strong>{selectedDb}</strong><span className="crumb-spacer"/><Badge>Healthy</Badge></div><section className="panel full-panel"><div className="panel-heading collection-heading"><div><h3>Collections</h3><p>Danh sách collections trong <b>{selectedDb}</b></p></div><Button icon={Plus} onClick={()=>notify('Tạo collection sẽ được kết nối với backend sau.')}>Create collection</Button></div><div className="table-wrap"><table><thead><tr><th>COLLECTION</th><th>DOCUMENTS</th><th>INDEXES</th><th>SIZE</th><th>LAST UPDATED</th><th></th></tr></thead><tbody>{collections.map(c=><tr key={c.name} className="clickable-row" onClick={()=>{setSelectedCollection(c.name);setActive('Documents')}}><td><div className="db-name-cell"><div className="collection-symbol"><Files size={16}/></div><div><strong>{c.name}</strong><span>Collection</span></div></div></td><td>{c.documents.toLocaleString('en-US')}</td><td><span className="index-count"><Zap size={13}/>{c.index}</span></td><td>{c.size}</td><td>{c.updated}</td><td><ChevronRight size={16}/></td></tr>)}</tbody></table></div></section><div className="info-callout"><CircleHelp size={17}/><div><strong>Collections organize your documents</strong><p>Mỗi collection chứa các document JSON có cấu trúc linh hoạt. Chọn một collection để xem và quản lý dữ liệu.</p></div></div></>}

        {active === 'Documents' && <><div className="crumb-card"><button onClick={()=>setActive('Databases')}><ChevronLeft size={14}/> Databases</button><ChevronRight size={14}/><button onClick={()=>setActive('Collections')}>{selectedDb}</button><ChevronRight size={14}/><strong>{selectedCollection}</strong></div><section className="panel full-panel"><div className="panel-heading"><div><h3>Documents <span className="count-pill">{filteredDocs.length}</span></h3><p>Browse, filter, and edit JSON documents.</p></div><Button icon={Plus} onClick={()=>setModal('document')}>Insert document</Button></div><div className="toolbar"><div className="search-box wide-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter documents by any field..."/></div><Button variant="secondary" icon={Code2} onClick={()=>setActive('Query Editor')}>Open query editor</Button></div><div className="document-list">{filteredDocs.map(doc=><div className="document-row" key={doc._id}><div className="document-title"><FileJson size={16}/><strong>{doc._id}</strong><span className="doc-type">JSON</span><span className="doc-name">{doc.name}</span></div><pre>{JSON.stringify(doc, null, 2)}</pre><button className="delete-doc" onClick={()=>deleteDoc(doc._id)} title="Delete demo document"><Trash2 size={15}/></button></div>)}{filteredDocs.length===0&&<div className="empty-state">Không tìm thấy document.</div>}</div><div className="panel-footer"><span>{filteredDocs.length} documents shown</span><span>Demo data only</span></div></section></>}

        {active === 'Query Editor' && <section className="panel query-panel"><div className="panel-heading"><div><h3><Terminal size={18}/> Query Editor</h3><p>Viết điều kiện lọc JSON và xem kết quả minh họa.</p></div><span className="connection-tag"><span className="status-dot"/>Local demo</span></div><div className="query-context"><span>Database</span><strong>{selectedDb}</strong><ChevronDown size={14}/><span className="context-sep"/><span>Collection</span><strong>{selectedCollection}</strong><ChevronDown size={14}/></div><label className="field-label">FILTER (JSON)</label><textarea className="query-input" value={query} onChange={e=>setQuery(e.target.value)} spellCheck="false"/><div className="query-examples"><span>Examples:</span><button onClick={()=>setQuery('{ "category": "laptop" }')}>category = laptop</button><button onClick={()=>setQuery('{ "active": true }')}>active = true</button><button onClick={()=>setQuery('{ "stock": 0 }')}>stock = 0</button></div><div className="query-actions"><span><Command size={13}/> JSON filter · exact match</span><Button icon={Terminal} onClick={runQuery}>Run query</Button></div>{queryResult && <div className="query-results"><div className="result-header"><strong>Results</strong><Badge>{queryResult.length} documents</Badge></div><pre>{JSON.stringify(queryResult, null, 2)}</pre><button className="text-link" onClick={()=>GenCopy(JSON.stringify(queryResult,null,2),notify)}><Copy size={14}/> Copy results</button></div>}<div className="info-callout"><CircleHelp size={17}/><div><strong>Prototype query engine</strong><p>Truy vấn hiện được chạy trên dữ liệu mẫu ở trình duyệt. Sau khi backend hoàn thành, thay hàm runQuery bằng lời gọi API.</p></div></div></section>}
        {active === 'AI Query' && <AiQuery />}
        {active === 'Indexes' && <section className="panel full-panel"><div className="panel-heading"><div><h3>Indexes</h3><p>Index giúp tìm kiếm hiệu quả hơn trên các trường dữ liệu.</p></div><Button icon={Plus} onClick={()=>notify('Tạo index sẽ gọi API backend khi được tích hợp.')}>Create index</Button></div><div className="table-wrap"><table><thead><tr><th>COLLECTION</th><th>INDEX NAME</th><th>FIELDS</th><th>TYPE</th><th>STATUS</th></tr></thead><tbody><tr><td>products</td><td><code>_id_</code></td><td><code>{'{ _id: 1 }'}</code></td><td>Unique</td><td><Badge>Ready</Badge></td></tr><tr><td>products</td><td><code>category_1</code></td><td><code>{'{ category: 1 }'}</code></td><td>Secondary</td><td><Badge>Ready</Badge></td></tr><tr><td>customers</td><td><code>email_1</code></td><td><code>{'{ email: 1 }'}</code></td><td>Unique</td><td><Badge>Ready</Badge></td></tr><tr><td>orders</td><td><code>createdAt_-1</code></td><td><code>{'{ createdAt: -1 }'}</code></td><td>Secondary</td><td><Badge>Ready</Badge></td></tr></tbody></table></div><div className="panel-footer"><span>4 indexes shown</span><span>Demo data</span></div></section>}
        {active === 'Replication' && (
  <section className="panel full-panel">
    <div className="panel-heading">
      <div>
        <h3>MongoDB Replica Set</h3>
        <p>
          Replica Set: {replication?.replicaSet || 'Đang chờ dữ liệu'}
        </p>
      </div>

      <Button
        variant="secondary"
        icon={RefreshCw}
        onClick={fetchReplication}
        small
      >
        Làm mới
      </Button>
    </div>

    {replicationLoading && (
      <div className="empty-state">
        Đang lấy trạng thái Replica Set...
      </div>
    )}

    {replicationError && (
      <div className="info-callout">
        <CircleHelp size={17} />
        <div>
          <strong>Không lấy được trạng thái</strong>
          <p>{replicationError}</p>
          <p>Kiểm tra backend tại cổng 3001 và thử làm mới.</p>
        </div>
      </div>
    )}

    {replication && !replicationError && (
      <>
        <div className="metrics-grid">
          <MetricCard
            title="Tổng số node"
            value={replicationMembers.length}
            change="Atlas"
            icon={Database}
            tone="purple"
            sub="Replica Set members"
          />

          <MetricCard
            title="Primary"
            value={replicationMembers.filter(
              m => m.state === 'PRIMARY'
            ).length}
            change="Node chính"
            icon={ShieldCheck}
            tone="green"
            sub="Nhận thao tác ghi"
          />

          <MetricCard
            title="Secondary"
            value={replication.members.filter(
              m => m.state === 'SECONDARY'
            ).length}
            change="Node phụ"
            icon={Files}
            tone="blue"
            sub="Nhận bản sao dữ liệu"
          />

          <MetricCard
            title="Node khỏe"
            value={replication.members.filter(
              m => m.health === 1
            ).length}
            change="Health = 1"
            icon={Activity}
            tone="green"
            sub={`Trên tổng ${replication.members.length} node`}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NODE</th>
                <th>VAI TRÒ</th>
                <th>HEALTH</th>
                <th>TRẠNG THÁI</th>
              </tr>
            </thead>

            <tbody>
              {replicationMembers.map(member => (
                <tr key={member.name}>
                  <td>
                    <div className="db-name-cell">
                      <div className="db-symbol blue">
                        <Database size={16} />
                      </div>
                      <div>
                        <strong>{member.name}</strong>
                      </div>
                    </div>
                  </td>

                  <td>
                    {member.state === 'PRIMARY'
                      ? 'Primary'
                      : member.state === 'SECONDARY'
                      ? 'Secondary'
                      : member.state}
                  </td>

                  <td>{member.health}</td>

                  <td>
                    <Badge
                      type={member.health === 1 ? 'green' : 'red'}
                    >
                      {member.health === 1 ? 'Healthy' : 'Unhealthy'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel-footer">
          <span>Đã nhận dữ liệu trực tiếp từ backend CloudDB.</span>
          <span>MongoDB Atlas</span>
        </div>
      </>
    )}
  </section>
)}
        

        {active === 'Monitoring' && <><div className="metrics-grid"><MetricCard title="API availability" value="99.9%" change="+0.2%" icon={Activity} tone="green" sub="7 ngày gần nhất"/><MetricCard title="Avg. latency" value="24 ms" change="−8.1%" icon={Gauge} tone="blue" sub="so với tuần trước"/><MetricCard title="Storage used" value="123.3 MB" change="+4.2%" icon={HardDrive} tone="orange" sub="so với tuần trước"/><MetricCard title="Active connections" value="12" change="+3" icon={Zap} tone="purple" sub="kết nối hiện tại"/></div><section className="panel monitoring-panel"><div className="panel-heading"><div><h3>Request activity</h3><p>Lưu lượng yêu cầu minh họa trong 24 giờ qua</p></div><Badge>Operational</Badge></div><div className="chart-area"><div className="chart-y-labels"><span>1.2k</span><span>900</span><span>600</span><span>300</span><span>0</span></div><div className="chart"><div className="chart-grid"><i/><i/><i/><i/><i/></div><svg viewBox="0 0 700 190" preserveAspectRatio="none"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#7c6df0" stopOpacity=".24"/><stop offset="100%" stopColor="#7c6df0" stopOpacity="0"/></linearGradient></defs><path d="M0 145 C35 140 45 115 75 127 S125 105 150 118 S190 88 220 103 S270 55 300 81 S350 94 375 65 S420 77 450 58 S500 74 525 43 S575 60 600 32 S660 45 700 18 L700 190 L0 190Z" fill="url(#area)"/><path d="M0 145 C35 140 45 115 75 127 S125 105 150 118 S190 88 220 103 S270 55 300 81 S350 94 375 65 S420 77 450 58 S500 74 525 43 S575 60 600 32 S660 45 700 18" fill="none" stroke="#7c6df0" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></svg><div className="chart-x-labels"><span>00:00</span><span>04:00</span><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span><span>24:00</span></div></div></div></section><div className="info-callout"><Activity size={17}/><div><strong>Monitoring data is illustrative</strong><p>Khi backend có metrics endpoint, hãy lấy dữ liệu thật thay cho biểu đồ và số liệu mẫu.</p></div></div></>}

        <footer className="page-footer"><span>© 2026 CloudDB Platform</span><span><span className="footer-dot"/> All systems operational</span><span>Version 0.1.0 · Frontend prototype</span></footer>
      </div>
    </main>

    
    {modal === 'database' && (
      <Modal
        title="Create a database"
        onClose={() => setModal('')}
      >
        <form onSubmit={createDb} className="modal-form">
          <p className="modal-desc">
            Nhập tên database bạn muốn tạo.
          </p>

          <label htmlFor="dbName">Database name</label>
          <input
            id="dbName"
            value={dbName}
            onChange={e => setDbName(e.target.value)}
            placeholder="e.g. inventory_db"
            required
          />

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModal('')}
            >
              Cancel
            </Button>
            <Button type="submit">Create database</Button>
          </div>
        </form>
      </Modal>
    )}

    {modal === 'document' && (
      <Modal
        title="Insert document"
        onClose={() => setModal('')}
      >
        <form onSubmit={addDoc} className="modal-form">
          <p className="modal-desc">
            Thêm document mẫu vào collection{' '}
            <b>{selectedCollection}</b>.
          </p>

          <label htmlFor="docName">Product name</label>
          <input
            id="docName"
            value={docName}
            onChange={e => setDocName(e.target.value)}
            placeholder="e.g. Wireless keyboard"
            required
          />

          <label htmlFor="docPrice">Price (VND)</label>
          <input
            id="docPrice"
            type="number"
            min="0"
            value={docPrice}
            onChange={e => setDocPrice(e.target.value)}
            placeholder="1500000"
            required
          />

          <div className="modal-actions">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModal('')}
            >
              Cancel
            </Button>
            <Button type="submit">Insert document</Button>
          </div>
        </form>
      </Modal>
    )}

        {toast && (
      <div className="toast">
        <Check size={16} />
        {toast}
        <button onClick={() => setToast('')}>
          <X size={14} />
        </button>
      </div>
    )}
  </div>
}

function GenCopy(text, notify) {
  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(text)
      .then(() => notify('Đã sao chép kết quả.'))
      .catch(() =>
        notify('Không thể sao chép trên trình duyệt này.')
      );
  } else {
    notify('Trình duyệt không hỗ trợ sao chép tự động.');
  }
}