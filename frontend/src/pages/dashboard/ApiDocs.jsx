import { useState } from 'react';
import { useToast } from '../../components/Toast';

// API Docs — endpoint reference (static content, mirrors legacy loadApiDocs)
export default function ApiDocs() {
  const base = window.location.origin;
  const toast = useToast();
  const [testKey, setTestKey] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const endpoints = [
    ['GET', '/manage/tunnels', 'Your live tunnels + recent history'],
    ['POST', '/manage/tunnels/{sub}/stop', 'Stop one of your live tunnels'],
    ['GET', '/manage/devices', 'Your connected remote devices'],
    ['GET', '/tokens', 'List your tunnel tokens'],
    ['POST', '/tokens', 'Create a new tunnel token'],
    ['DELETE', '/tokens/{id}', 'Delete a tunnel token'],
    ['GET', '/apikeys', 'List your API keys'],
    ['POST', '/apikeys', 'Create an API key'],
    ['GET', '/invoices', 'Your invoices'],
    ['GET', '/plans', 'Available plans'],
    ['GET', '/teams', 'Your teams'],
    ['POST', '/tickets', 'Open a support ticket'],
  ];

  const testApiKey = async () => {
    if (!testKey.trim()) return toast('Paste an API key first', 'error');
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch(`${base}/api/v1/manage/tunnels`, {
        headers: { 'X-Api-Key': testKey.trim() },
      });
      const data = await response.json().catch(() => ({}));
      setTestResult({ ok: response.ok, status: response.status, data });
    } catch (error) {
      setTestResult({ ok: false, status: 0, data: { detail: error.message } });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="page-title">API Documentation</div>
      <div className="page-subtitle">Manage IRAGT from scripts, CI pipelines, and the Python SDK</div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>Authentication</h2></div>
        <div className="card-body">
          <p className="dim">Create a key under <strong>API Keys</strong>, then send the full key in the <span className="code">X-Api-Key</span> header on every management request:</p>
          <div className="cmd-box"><pre>X-Api-Key: pk_your_key_here</pre></div>
          <p className="dim">All endpoints live under <span className="code">{base}/api/v1</span>. JWT Bearer tokens (your dashboard login) also work.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>Test Your API Key</h2></div>
        <div className="card-body">
          <p className="dim">Paste the full key shown when it was created. This calls <span className="code">GET /api/v1/manage/tunnels</span>; a successful response means the key is working.</p>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input type="password" value={testKey} onChange={(e) => setTestKey(e.target.value)} placeholder="pk_your_key_here" style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={testApiKey} disabled={testing}>{testing ? 'Testing...' : 'Test Key'}</button>
          </div>
          {testResult && (
            <div className={`inline-note ${testResult.ok ? '' : 'amber'}`} style={{ marginTop: '.75rem' }}>
              <span>{testResult.ok ? `✅ Working (HTTP ${testResult.status})` : `❌ Not working (HTTP ${testResult.status || 'network error'})`}</span>
              <span className="code" style={{ overflowWrap: 'anywhere' }}>{testResult.ok ? 'Authenticated successfully' : (testResult.data.detail || 'Check the key and try again')}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>Endpoints</h2></div>
        <div className="card-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead>
            <tbody>
              {endpoints.map(([method, path, desc]) => (
                <tr key={method + path}>
                  <td><span className={`badge ${method === 'GET' ? 'badge-green' : ''}`}>{method}</span></td>
                  <td className="code">{path}</td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}