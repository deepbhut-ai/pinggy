import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../components/Toast';

// API Docs — interactive endpoint tester with API key
export default function ApiDocs() {
  const base = window.location.origin;
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');
  const [keyVerified, setKeyVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [testingEndpoint, setTestingEndpoint] = useState(null);
  const [results, setResults] = useState({});
  const [savedKeys, setSavedKeys] = useState([]);
  const [requestBodies, setRequestBodies] = useState({}); // editable JSON bodies per endpoint
  const [pathParams, setPathParams] = useState({}); // editable path params per endpoint
  const [expandedCard, setExpandedCard] = useState(null); // which card is expanded for editing

  // Auto-load the user's API keys — pick the first one with a full key and auto-verify
  const loadKeys = useCallback(async () => {
    try {
      const keys = await api('/apikeys');
      setSavedKeys(keys);
      const firstWithKey = keys.find((k) => k.key);
      if (firstWithKey) {
        setApiKey(firstWithKey.key);
        // Auto-verify against the server
        try {
          const resp = await fetch(`${base}/api/v1/manage/tunnels`, { headers: { 'X-Api-Key': firstWithKey.key } });
          setKeyVerified(resp.ok);
        } catch (e) { /* silent */ }
      }
    } catch (e) { /* silent */ }
  }, [base]);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const endpoints = [
    { method: 'GET',    path: '/manage/tunnels',          desc: 'Your live tunnels + recent history' },
    { method: 'POST',   path: '/manage/tunnels/{sub}/stop', desc: 'Stop one of your live tunnels' },
    { method: 'GET',    path: '/manage/devices',          desc: 'Your connected remote devices' },
    { method: 'GET',    path: '/tokens',                  desc: 'List your tunnel tokens' },
    { method: 'POST',   path: '/tokens',                  desc: 'Create a new tunnel token' },
    { method: 'PUT',    path: '/tokens/{id}',             desc: 'Update token — set name, subdomain (fixed_subdomain), tunnel type' },
    { method: 'DELETE', path: '/tokens/{id}',             desc: 'Delete a tunnel token' },
    { method: 'POST',   path: '/tokens/{id}/domains',     desc: 'Attach an extra custom domain to a token (Pro)' },
    { method: 'DELETE', path: '/tokens/{id}/domains/{domain}', desc: 'Remove an extra domain from a token' },
    { method: 'POST',   path: '/tokens/{id}/regenerate',  desc: 'Regenerate a token (old one stops working)' },
    { method: 'PUT',    path: '/users/me/custom-domain',  desc: 'Set/clear your primary custom domain on a token' },
    { method: 'GET',    path: '/users/me/verify-domain',   desc: 'Verify a domain\'s DNS points to our server' },
    { method: 'GET',    path: '/apikeys',                 desc: 'List your API keys' },
    { method: 'POST',   path: '/apikeys',                 desc: 'Create an API key' },
    { method: 'GET',    path: '/invoices',                desc: 'Your invoices' },
    { method: 'GET',    path: '/plans',                   desc: 'Available plans' },
    { method: 'GET',    path: '/teams',                   desc: 'Your teams' },
    { method: 'POST',   path: '/tickets',                 desc: 'Open a support ticket' },
  ];

  // Sample request bodies — user can edit these before testing
  const SAMPLE_BODIES = {
    'POST/tokens':  JSON.stringify({ name: 'My token' }, null, 2),
    'POST/apikeys': JSON.stringify({ name: 'My API key', expiry_days: null }, null, 2),
    'POST/tickets': JSON.stringify({ subject: 'Need help', message: 'My tunnel is not connecting' }, null, 2),
    'POST/teams':   JSON.stringify({ name: 'My team' }, null, 2),
    'PUT/tokens/{id}': JSON.stringify({ name: 'My token', fixed_subdomain: 'my-subdomain', tunnel_mode: 'http' }, null, 2),
    'POST/tokens/{id}/domains': JSON.stringify({ domain: 'app.mydomain.com' }, null, 2),
    'PUT/users/me/custom-domain': JSON.stringify({ custom_domain: 'mydomain.com', token_id: '' }, null, 2),
  };

  // Path param hints — {param: description}
  const PATH_PARAMS = {
    'POST/manage/tunnels/{sub}/stop': { sub: 'Subdomain of the live tunnel to stop' },
    'DELETE/tokens/{id}':             { id: 'Token ID (get it from GET /tokens)' },
    'PUT/tokens/{id}':                { id: 'Token ID (get it from GET /tokens)' },
    'POST/tokens/{id}/domains':       { id: 'Token ID (get it from GET /tokens)' },
    'DELETE/tokens/{id}/domains/{domain}': { id: 'Token ID', domain: 'Domain to remove (e.g. app.mydomain.com)' },
    'POST/tokens/{id}/regenerate':    { id: 'Token ID (get it from GET /tokens)' },
    'GET/users/me/verify-domain':      { domain: 'Domain to verify (e.g. mydomain.com)' },
  };

  const verifyKey = async () => {
    if (!apiKey.trim()) return toast('Paste your API key first', 'error');
    setVerifying(true);
    try {
      const resp = await fetch(`${base}/api/v1/manage/tunnels`, { headers: { 'X-Api-Key': apiKey.trim() } });
      if (resp.ok) {
        setKeyVerified(true);
        toast('✅ API key verified — ready to test endpoints', 'success');
      } else {
        setKeyVerified(false);
        toast(`❌ Invalid key (HTTP ${resp.status})`, 'error');
      }
    } catch (e) {
      setKeyVerified(false);
      toast('Network error — check your connection', 'error');
    }
    setVerifying(false);
  };

  // Verify a given key directly (used by the key dropdown)
  const verifyKeyWith = async (keyToVerify) => {
    if (!keyToVerify?.trim()) return;
    try {
      const resp = await fetch(`${base}/api/v1/manage/tunnels`, { headers: { 'X-Api-Key': keyToVerify.trim() } });
      setKeyVerified(resp.ok);
      if (resp.ok) toast('✅ API key verified — ready to test endpoints', 'success');
      else toast(`❌ Invalid key (HTTP ${resp.status})`, 'error');
    } catch (e) { setKeyVerified(false); }
  };

  const testEndpoint = async (ep) => {
    if (!apiKey.trim()) return toast('Enter your API key first', 'error');
    const key = ep.method + ep.path;
    setTestingEndpoint(key);
    try {
      // Build path — use user-entered path params if provided, else auto-fetch real ones
      let testPath = ep.path;
      const params = pathParams[key] || {};

      // Generic path param replacement for user-entered values
      ['sub', 'id', 'domain'].forEach((p) => {
        if (params[p] && testPath.includes(`{${p}}`)) {
          testPath = testPath.replace(`{${p}}`, encodeURIComponent(params[p]));
        }
      });

      // Auto-fetch real values for known endpoints if not user-provided
      if ((ep.path === '/manage/tunnels/{sub}/stop') && !params.sub) {
        const t = await fetch(`${base}/api/v1/manage/tunnels`, { headers: { 'X-Api-Key': apiKey.trim() } });
        const td = await t.json().catch(() => ({}));
        if (!td.live?.length) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: 'No live tunnels to stop. Start a tunnel first (see Quickstart), or enter a subdomain above.' }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        testPath = ep.path.replace('{sub}', td.live[0].subdomain);
      }

      const needsTokenId = ['/tokens/{id}', '/tokens/{id}/domains', '/tokens/{id}/regenerate'].some((p) => ep.path === p);
      if (needsTokenId && !params.id && testPath.includes('{id}')) {
        const t = await fetch(`${base}/api/v1/tokens`, { headers: { 'X-Api-Key': apiKey.trim() } });
        const td = await t.json().catch(() => []);
        if (!Array.isArray(td) || !td.length) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: 'No tokens found. Create one first, or enter a token ID above.' }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        testPath = testPath.replace('{id}', td[td.length - 1].id);
      }

      // Warn if a required path param is still missing
      const missingParam = testPath.match(/\{(\w+)\}/);
      if (missingParam) {
        toast(`Enter a value for "${missingParam[1]}" above`, 'error');
        setTestingEndpoint(null);
        return;
      }

      const opts = { method: ep.method, headers: { 'X-Api-Key': apiKey.trim() } };

      // PUT/POST with body — use the user's editable JSON body
      const bodyKey = ep.method + ep.path;
      if ((ep.method === 'POST' || ep.method === 'PUT') && SAMPLE_BODIES[bodyKey]) {
        const rawBody = requestBodies[bodyKey] ?? SAMPLE_BODIES[bodyKey];
        let parsed;
        try {
          parsed = JSON.parse(rawBody); // validate JSON
        } catch {
          toast('Invalid JSON in request body — fix it and try again', 'error');
          setTestingEndpoint(null);
          return;
        }
        opts.headers['Content-Type'] = 'application/json';
        opts.body = rawBody;
        // PUT /users/me/custom-domain — API uses query params, not JSON body
        if (ep.path === '/users/me/custom-domain') {
          const d = (parsed.custom_domain || '').trim();
          const tid = (parsed.token_id || '').trim();
          if (!d) {
            toast('Enter a custom_domain value in the JSON body', 'error');
            setTestingEndpoint(null);
            return;
          }
          opts.body = undefined;
          opts.headers['Content-Type'] = undefined;
          let queryUrl = `${base}/api/v1${ep.path}?custom_domain=${encodeURIComponent(d)}`;
          if (tid) queryUrl += `&token_id=${encodeURIComponent(tid)}`;
          const resp2 = await fetch(queryUrl, opts);
          const data2 = await resp2.json().catch(() => ({}));
          setResults((prev) => ({ ...prev, [key]: { ok: resp2.ok, status: resp2.status, data: data2, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
      }

      // GET /users/me/verify-domain — needs a domain query param
      if (ep.path === '/users/me/verify-domain') {
        const domainVal = (pathParams[key]?.domain || '').trim();
        if (!domainVal) {
          toast('Enter a domain in the "domain" field above', 'error');
          setTestingEndpoint(null);
          return;
        }
        const resp2 = await fetch(`${base}/api/v1${ep.path}?domain=${encodeURIComponent(domainVal)}`, opts);
        const data2 = await resp2.json().catch(() => ({}));
        setResults((prev) => ({ ...prev, [key]: { ok: resp2.ok, status: resp2.status, data: data2, testedAt: new Date().toLocaleTimeString() } }));
        setTestingEndpoint(null);
        return;
      }

      const resp = await fetch(`${base}/api/v1${testPath}`, opts);
      const data = await resp.json().catch(() => ({}));
      setResults((prev) => ({
        ...prev,
        [key]: { ok: resp.ok, status: resp.status, data, testedAt: new Date().toLocaleTimeString() },
      }));
    } catch (e) {
      setResults((prev) => ({
        ...prev,
        [key]: { ok: false, status: 0, data: { detail: e.message }, testedAt: new Date().toLocaleTimeString() },
      }));
    }
    setTestingEndpoint(null);
  };

  return (
    <>
      <div className="page-title">API Documentation</div>
      <div className="page-subtitle">Manage IRAGT from scripts, CI pipelines, and the Python SDK</div>

      {/* API key input — set once, then test endpoints below */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>🔑 Set your API key</h2></div>
        <div className="card-body">
          <p className="dim" style={{ marginBottom: '.5rem' }}>Paste your API key below. Once verified, you can test any endpoint with one click.</p>
          {savedKeys.length > 0 && (
            <div style={{ marginBottom: '.5rem' }}>
              <label className="dim" style={{ fontSize: '.78rem', fontWeight: 600, display: 'block', marginBottom: '.3rem' }}>Your API keys</label>
              <select
                value={apiKey}
                onChange={(e) => { if (e.target.value) { setApiKey(e.target.value); setKeyVerified(false); setResults({}); verifyKeyWith(e.target.value); } }}
                style={{ width: '100%', maxWidth: 400 }}
              >
                {savedKeys.map((k) => (
                  <option key={k.id} value={k.key || ''}>{k.name} — {k.prefix}…</option>
                ))}
              </select>
            </div>
          )}
          {savedKeys.length === 0 && (
            <div className="inline-note amber" style={{ marginBottom: '.5rem' }}>
              <span>No API keys yet. <a href="/dashboard/apikeys" style={{ color: 'var(--brand)' }}>Create one first →</a></span>
            </div>
          )}
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setKeyVerified(false); setResults({}); }}
              placeholder="pk_your_key_here"
              style={{ flex: 1 }}
            />
            <button className="btn btn-sm" onClick={verifyKey} disabled={verifying || !apiKey.trim()}>
              {verifying ? '🔄 Verifying...' : keyVerified ? '✅ Verified' : 'Verify Key'}
            </button>
          </div>
          {keyVerified && (
            <div className="inline-note" style={{ marginTop: '.5rem', background: 'rgba(41,169,127,.08)', borderColor: 'rgba(41,169,127,.3)' }}>
              <span>✅ Key verified! Click "Test" on any endpoint below to try it.</span>
            </div>
          )}
          <p className="dim" style={{ fontSize: '.75rem', marginTop: '.5rem' }}>
            All endpoints live under <span className="code">{base}/api/v1</span>. Send the key in the <span className="code">X-Api-Key</span> header.
          </p>
        </div>
      </div>

      {/* Endpoint cards — each is a rectangular box with editable data + Test button */}
      <div className="apidocs-grid">
        {endpoints.map((ep) => {
          const key = ep.method + ep.path;
          const result = results[key];
          const isTesting = testingEndpoint === key;
          const hasBody = !!SAMPLE_BODIES[key];
          const hasParams = !!PATH_PARAMS[key];
          const isExpanded = expandedCard === key;
          return (
            <div key={key} className="apidocs-card">
              <div className="apidocs-card-header">
                <span className={`badge ${ep.method === 'GET' ? 'badge-green' : ep.method === 'POST' ? 'badge-blue' : ep.method === 'PUT' ? '' : 'badge-red'}`}>{ep.method}</span>
                <span className="code apidocs-path">{ep.path}</span>
              </div>
              <p className="dim apidocs-desc">{ep.desc}</p>

              {/* Editable data section — expand/collapse */}
              {(hasBody || hasParams) && (
                <div className="apidocs-edit">
                  <button className="btn btn-sm btn-ghost apidocs-edit-toggle" onClick={() => setExpandedCard(isExpanded ? null : key)}>
                    {isExpanded ? '▾ Hide data' : '▸ Edit data'}
                  </button>
                  {isExpanded && (
                    <div className="apidocs-edit-body">
                      {hasParams && Object.entries(PATH_PARAMS[key]).map(([param, hint]) => (
                        <div key={param} style={{ marginBottom: '.5rem' }}>
                          <label className="dim" style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>
                            {param} — <span style={{ fontWeight: 400 }}>{hint}</span>
                          </label>
                          <input
                            type="text"
                            value={pathParams[key]?.[param] || ''}
                            onChange={(e) => setPathParams((prev) => ({ ...prev, [key]: { ...prev[key], [param]: e.target.value } }))}
                            placeholder={`Leave empty to auto-use your ${param === 'sub' ? 'first live tunnel' : 'last token'}`}
                          />
                        </div>
                      ))}
                      {hasBody && (
                        <div>
                          <label className="dim" style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: '.25rem' }}>
                            Request body (JSON) — edit and test
                          </label>
                          <textarea
                            value={requestBodies[key] ?? SAMPLE_BODIES[key]}
                            onChange={(e) => setRequestBodies((prev) => ({ ...prev, [key]: e.target.value }))}
                            rows={5}
                            spellCheck={false}
                            className="apidocs-json-input"
                          />
                        </div>
                      )}
                      <p className="dim" style={{ fontSize: '.68rem', marginTop: '.3rem' }}>
                        💡 Edit the data above, then click Test — your values will be sent.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="apidocs-card-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => testEndpoint(ep)}
                  disabled={isTesting || !apiKey.trim()}
                >
                  {isTesting ? '🔄 Testing...' : '▶ Test'}
                </button>
                {result && (
                  <span className={`apidocs-result ${result.ok ? 'ok' : 'fail'}`}>
                    {result.ok ? '✅' : '❌'} HTTP {result.status} · {result.testedAt}
                  </span>
                )}
              </div>
              {result && (
                <div className="apidocs-response">
                  <pre>{JSON.stringify(result.data, null, 2).substring(0, 500)}</pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}