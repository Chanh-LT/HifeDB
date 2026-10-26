
import React, { useState } from 'react';

export default function AiQuery() {
  const [prompt, setPrompt] = useState('');
  const [database, setDatabase] = useState('shop_db');
  const [collection, setCollection] = useState('products');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runAIQuery() {
    if (!prompt.trim()) {
      setError('Vui lòng nhập yêu cầu truy vấn.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(
        'http://localhost:3001/api/ai/generate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            database,
            collection
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'AI tạo truy vấn thất bại.');
      }

      setResult(data);
    } catch (err) {
      setError(err.message || 'Không thể kết nối backend.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel full-panel" style={{ padding: 24 }}>
      <h2>AI Query</h2>
      <p>Nhập yêu cầu bằng ngôn ngữ tự nhiên để AI tạo truy vấn MongoDB.</p>

      <label>Database</label>
      <input
        value={database}
        onChange={e => setDatabase(e.target.value)}
        placeholder="shop_db"
      />

      <label>Collection</label>
      <input
        value={collection}
        onChange={e => setCollection(e.target.value)}
        placeholder="products"
      />

      <label>Yêu cầu truy vấn</label>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Ví dụ: Tìm 5 sản phẩm có giá lớn hơn 1 triệu"
        rows={4}
        style={{ width: '100%', marginTop: 8, marginBottom: 12 }}
      />

      <button className="btn primary" onClick={runAIQuery} disabled={loading}>
        {loading ? 'Đang tạo truy vấn...' : 'Tạo truy vấn bằng AI'}
      </button>

      {error && (
        <p style={{ color: 'red', marginTop: 16 }}>{error}</p>
      )}

      {result && (
        <pre style={{
          marginTop: 16,
          padding: 16,
          overflowX: 'auto',
          background: '#f4f5f8',
          borderRadius: 8,
          whiteSpace: 'pre-wrap'
        }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}
