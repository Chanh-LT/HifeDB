import React, { useState } from 'react';
import { Sparkles, Terminal, Play, AlertCircle, CheckCircle2, Copy } from 'lucide-react';

const SUGGESTIONS = [
  { label: 'Laptop trên 30 triệu', prompt: 'Tìm các laptop có giá trên 30 triệu', db: 'shop_db', col: 'products' },
  { label: 'Phụ kiện còn hàng', prompt: 'Tìm các sản phẩm phụ kiện còn hàng trong kho', db: 'shop_db', col: 'products' },
  { label: 'Sản phẩm hết hàng', prompt: 'Tìm sản phẩm hết hàng stock = 0', db: 'shop_db', col: 'products' },
  { label: 'Phim hành động đánh giá cao', prompt: 'Tìm phim hành động có điểm rating trên 8.5', db: 'movie_db', col: 'movies' },
  { label: 'Phim viễn tưởng (Sci-Fi)', prompt: 'Tìm phim thể loại Sci-Fi sản xuất từ năm 2010', db: 'movie_db', col: 'movies' },
];

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export default function AiQuery() {
  const [prompt, setPrompt] = useState('');
  const [database, setDatabase] = useState('shop_db');
  const [collection, setCollection] = useState('products');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [executing, setExecuting] = useState(false);
  const [execResult, setExecResult] = useState(null);
  const [execError, setExecError] = useState('');
  const [copied, setCopied] = useState(false);

  function applySuggestion(item) {
    setPrompt(item.prompt);
    setDatabase(item.db);
    setCollection(item.col);
    setError('');
  }

  async function runAIQuery() {
    if (!prompt.trim()) {
      setError('Vui lòng nhập yêu cầu truy vấn.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setExecResult(null);
    setExecError('');

    try {
      const response = await fetch(`${API_BASE}/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          question: prompt,
          database,
          collection,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.detail || data.message || 'AI tạo truy vấn thất bại.');
      }

      setResult(data);
      if (data.query?.collection) {
        setCollection(data.query.collection);
      }
      if (data.query?.database) {
        setDatabase(data.query.database);
      }
    } catch (err) {
      setError(err.message || 'Không thể kết nối Router Gateway cổng 8000.');
    } finally {
      setLoading(false);
    }
  }

  async function executeQuery() {
    if (!result?.query) return;

    setExecuting(true);
    setExecError('');
    setExecResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/ai/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          database,
          collection: result.query.collection || collection,
          filter: result.query.filter || {},
          projection: result.query.projection || {},
          sort: result.query.sort || {},
          limit: result.query.limit || 20,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.detail || data.message || 'Thực thi truy vấn thất bại.');
      }

      setExecResult(data);
    } catch (err) {
      setExecError(err.message || 'Lỗi khi thực thi truy vấn trên cụm Shards.');
    } finally {
      setExecuting(false);
    }
  }

  function handleCopy(text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <section className="panel full-panel" style={{ padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
        }}>
          <Sparkles size={18} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>HifeDB AI Query Engine</h2>
          <p style={{ margin: 0, color: 'var(--text-secondary, #64748b)', fontSize: 13 }}>
            Chuyển đổi ngôn ngữ tự nhiên thành bộ lọc JSON và thực thi Scatter-Gather trên cụm Shards.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 18 }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Database mục tiêu</label>
          <input
            value={database}
            onChange={e => setDatabase(e.target.value)}
            placeholder="shop_db hoặc movie_db"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Collection mục tiêu</label>
          <input
            value={collection}
            onChange={e => setCollection(e.target.value)}
            placeholder="products hoặc movies"
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Yêu cầu truy vấn bằng ngôn ngữ tự nhiên</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Ví dụ: Tìm laptop có giá trên 30 triệu hoặc Phim hành động điểm đánh giá trên 8.5"
          rows={3}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Gợi ý mẫu:</span>
        {SUGGESTIONS.map((item, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => applySuggestion(item)}
            style={{
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              cursor: 'pointer',
              color: '#334155',
              transition: 'all 0.15s ease',
            }}
            onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseOut={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button
          className="btn primary"
          onClick={runAIQuery}
          disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Sparkles size={16} />
          {loading ? 'Đang tạo truy vấn...' : 'Tạo truy vấn HifeDB JSON'}
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', marginTop: 16, padding: '10px 14px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div style={{ marginTop: 24, padding: 20, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} color="#10b981" />
              Truy vấn sinh bởi HifeDB AI Agent
            </h3>
            <button
              type="button"
              onClick={() => handleCopy(JSON.stringify(result.query || result, null, 2))}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
            >
              <Copy size={13} />
              {copied ? 'Đã sao chép!' : 'Sao chép JSON'}
            </button>
          </div>

          {result.explanation && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#1e40af', marginBottom: 12 }}>
              💡 <b>Phân tích AI:</b> {result.explanation}
            </div>
          )}

          <pre style={{
            padding: 14,
            background: '#0f172a',
            color: '#f8fafc',
            borderRadius: 8,
            overflowX: 'auto',
            fontSize: 13,
            lineHeight: 1.55,
            margin: 0,
          }}>
            {JSON.stringify(result.query || result, null, 2)}
          </pre>

          {result.query && (
            <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                className="btn secondary"
                onClick={executeQuery}
                disabled={executing}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#10b981', color: '#fff', border: 'none' }}
              >
                <Play size={15} />
                {executing ? 'Đang truy vấn các Shards...' : '▶ Thực thi Scatter-Gather trên cụm Shards'}
              </button>
            </div>
          )}

          {execError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', marginTop: 12 }}>
              <AlertCircle size={15} />
              <span>{execError}</span>
            </div>
          )}

          {execResult && (
            <div style={{ marginTop: 18, padding: 16, background: '#ffffff', borderRadius: 10, border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h4 style={{ color: '#059669', margin: 0, fontSize: 14, fontWeight: 700 }}>
                  ✓ Kết quả thực thi từ LMDB B+ Tree ({execResult.count || 0} tài liệu):
                </h4>
                <span style={{ fontSize: 12, color: '#64748b' }}>Phân tán Scatter-Gather</span>
              </div>
              <pre style={{ margin: 0, overflowX: 'auto', fontSize: 12.5, maxHeight: 350, background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0', color: '#1e293b' }}>
                {JSON.stringify(execResult.documents, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
