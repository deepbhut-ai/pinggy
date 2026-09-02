import { api } from '../../api/client';

// API Docs — endpoint reference (static content, mirrors legacy loadApiDocs)
export default function ApiDocs() {
  const base = window.location.origin;
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

  return (
    <>
      <div className="page-title">API Documentation</div>
      <div className="page-subtitle">Manage IRAGT from scripts, CI pipelines, and the Python SDK</div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>Authentication</h2></div>
        <div className="card-body">
          <p className="dim">Create a key under <strong>API Keys</strong>, then send it on every request:</p>
          <div className="cmd-box"><pre>X-Api-Key: pk_your_key_here</pre></div>
          <p className="dim">All endpoints live under <span className="code">{base}/api/v1</span>. JWT Bearer tokens (your dashboard login) also work.</p>
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