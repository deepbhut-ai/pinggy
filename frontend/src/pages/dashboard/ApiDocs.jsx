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

  const sections = [
    {
      id: 'setup',
      title: '1. Setup — get your API key ready',
      subtitle: 'Create an API key, then verify it here before calling other endpoints.',
      endpoints: [
        { method: 'POST', path: '/apikeys', desc: 'Create a new API key. Save the returned key — it is shown only once.' },
        { method: 'GET',  path: '/apikeys', desc: 'List your existing API keys (secrets are masked).' },
      ],
    },
    {
      id: 'tokens',
      title: '2. Tokens — create and manage tunnel tokens',
      subtitle: 'A token is required to start a tunnel. Create one, then optionally set a fixed subdomain or custom domain.',
      endpoints: [
        { method: 'GET',    path: '/tokens',                  desc: 'Step 2a: List your existing tokens.' },
        { method: 'POST',   path: '/tokens',                  desc: 'Step 2b: Create a new tunnel token. Copy the token value to use in the SSH command.' },
        { method: 'PUT',    path: '/tokens/{id}',             desc: 'Step 2c (optional): Update token name, fixed subdomain, or tunnel mode.' },
        { method: 'POST',   path: '/tokens/{id}/regenerate',  desc: 'Rotate a token. The old value stops working immediately.' },
        { method: 'DELETE', path: '/tokens/{id}',             desc: 'Delete a token and release its resources.' },
      ],
    },
    {
      id: 'tunnel',
      title: '3. Start and monitor tunnels',
      subtitle: 'Use your token in the SSH command, then monitor or stop live tunnels via the API.',
      endpoints: [
        { method: 'GET',    path: '/manage/tunnels',          desc: 'Step 3a: List your currently live tunnels and recent history.' },
        { method: 'POST',   path: '/manage/tunnels/{sub}/stop', desc: 'Step 3b: Stop a live tunnel by its subdomain.' },
        { method: 'GET',    path: '/manage/devices',          desc: 'List remote devices connected to your account.' },
      ],
    },
    {
      id: 'domains',
      title: '4. Domains — add root domains and subdomains',
      subtitle: 'First add a root domain, then create subdomains under it. Each root domain gets its own token.',
      endpoints: [
        { method: 'GET',    path: '/domains',                 desc: 'Step 4a: List all your root domains and attached subdomains.' },
        { method: 'POST',   path: '/domains',                 desc: 'Step 4b: Add a root domain. This creates a dedicated token with that domain as the primary address.' },
        { method: 'PUT',    path: '/domains/{domain}',        desc: 'Step 4c: Rename a root domain to a new domain.' },
        { method: 'DELETE', path: '/domains/{domain}',        desc: 'Step 4d: Remove a root domain and its token.' },
        { method: 'GET',    path: '/subdomains',              desc: 'Step 4e: List all subdomains under your root domains.' },
        { method: 'POST',   path: '/subdomains',              desc: 'Step 4f: Create a subdomain under one of your root domains.' },
        { method: 'PUT',    path: '/subdomains/{subdomain}',  desc: 'Step 4g: Rename a subdomain.' },
        { method: 'DELETE', path: '/subdomains/{subdomain}',  desc: 'Step 4h: Remove a subdomain.' },
      ],
    },
    {
      id: 'advanced',
      title: '5. Advanced token domain options',
      subtitle: 'Attach extra domains to an existing token, or manage your primary custom domain directly.',
      endpoints: [
        { method: 'POST',   path: '/tokens/{id}/domains',     desc: 'Attach an extra custom domain to an existing token (Pro).' },
        { method: 'DELETE', path: '/tokens/{id}/domains/{domain}', desc: 'Remove an extra domain from a token.' },
        { method: 'PUT',    path: '/users/me/custom-domain',  desc: 'Set or clear your primary custom domain on a token.' },
        { method: 'GET',    path: '/users/me/verify-domain',   desc: 'Verify DNS for a domain points to our server.' },
      ],
    },
    {
      id: 'teams',
      title: '6. Teams — share tokens with your team',
      subtitle: 'Create a team, add members, and assign roles.',
      endpoints: [
        { method: 'GET',    path: '/teams',                   desc: 'Step 6a: List your teams and their members.' },
        { method: 'POST',   path: '/teams',                  desc: 'Step 6b: Create a new team.' },
        { method: 'POST',   path: '/teams/{team_id}/members', desc: 'Step 6c: Invite a member to a team.' },
        { method: 'PATCH',  path: '/teams/{team_id}/members/{email}', desc: 'Step 6d: Change a member role (admin or member).' },
        { method: 'DELETE', path: '/teams/{team_id}/members/{email}', desc: 'Step 6e: Remove a member from a team.' },
      ],
    },
    {
      id: 'billing',
      title: '7. Billing and support',
      subtitle: 'View plans, invoices, and open support tickets.',
      endpoints: [
        { method: 'GET', path: '/plans',      desc: 'List available subscription plans.' },
        { method: 'GET', path: '/invoices/my', desc: 'List your invoices and payment status.' },
        { method: 'GET', path: '/tickets/my', desc: 'List your support tickets.' },
        { method: 'POST', path: '/tickets',    desc: 'Open a new support ticket.' },
      ],
    },
  ];

  // Sample request bodies — user can edit these before testing
  const SAMPLE_BODIES = {
    'POST/tokens':  JSON.stringify({ name: 'My token' }, null, 2),
    'POST/apikeys': JSON.stringify({ name: 'My API key', expiry_days: null }, null, 2),
    'POST/tickets': JSON.stringify({ subject: 'Need help', message: 'My tunnel is not connecting' }, null, 2),
    'POST/teams':   JSON.stringify({ name: 'My team' }, null, 2),
    'POST/domains': JSON.stringify({ domain: 'mycompany.com' }, null, 2),
    'PUT/domains/{domain}': JSON.stringify({ new_domain: 'mynewcompany.com' }, null, 2),
    'POST/subdomains': JSON.stringify({ subdomain: 'api', domain: 'callingagents.in' }, null, 2),
    'PUT/subdomains/{subdomain}': JSON.stringify({ new_subdomain: 'newapi', domain: 'bedrive.callingagents.in' }, null, 2),
    'DELETE/subdomains/{subdomain}': JSON.stringify({ domain: 'bedrive.callingagents.in' }, null, 2),
    'PUT/tokens/{id}': JSON.stringify({ name: 'My token', fixed_subdomain: 'my-subdomain', tunnel_mode: 'http' }, null, 2),
    'POST/tokens/{id}/domains': JSON.stringify({ domain: 'app.mydomain.com' }, null, 2),
    'PUT/users/me/custom-domain': JSON.stringify({ custom_domain: 'mydomain.com', token_id: '' }, null, 2),
    'POST/teams/{team_id}/members': JSON.stringify({ email: 'teammate@example.com', role: 'member' }, null, 2),
    'PATCH/teams/{team_id}/members/{email}': JSON.stringify({ role: 'admin' }, null, 2),
  };

  // Path param hints — {param: description}
  const PATH_PARAMS = {
    'PUT/domains/{domain}':          { domain: 'Current domain to change (e.g. mycompany.com)' },
    'DELETE/domains/{domain}':       { domain: 'Domain to remove (e.g. mycompany.com)' },
    'PUT/subdomains/{subdomain}':    { subdomain: 'Current subdomain prefix (e.g. api)', new_subdomain: 'New subdomain prefix (e.g. newapi)', domain: 'Parent root domain you own (e.g. callingagents.in)' },
    'DELETE/subdomains/{subdomain}': { subdomain: 'Subdomain prefix to remove (e.g. api)', domain: 'Parent root domain you own (e.g. callingagents.in)' },
    'POST/manage/tunnels/{sub}/stop': { sub: 'Subdomain of the live tunnel to stop' },
    'DELETE/tokens/{id}':             { id: 'Token ID (get it from GET /tokens)' },
    'PUT/tokens/{id}':                { id: 'Token ID (get it from GET /tokens)' },
    'POST/tokens/{id}/domains':       { id: 'Token ID (get it from GET /tokens)' },
    'DELETE/tokens/{id}/domains/{domain}': { id: 'Token ID', domain: 'Domain to remove (e.g. app.mydomain.com)' },
    'POST/tokens/{id}/regenerate':    { id: 'Token ID (get it from GET /tokens)' },
    'GET/users/me/verify-domain':      { domain: 'Domain to verify (e.g. mydomain.com)' },
    'POST/teams/{team_id}/members':   { team_id: 'Team ID (get it from GET /teams)' },
    'PATCH/teams/{team_id}/members/{email}': { team_id: 'Team ID', email: 'Member email to promote/demote' },
    'DELETE/teams/{team_id}/members/{email}': { team_id: 'Team ID', email: 'Member email to remove' },
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

  // Helpers
  const sanitizeDomain = (v) => (v || '').toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
  const sanitizeSubdomain = (v) => (v || '').toLowerCase().trim().replace(/[^a-z0-9-]/g, '');
  const isValidDomain = (d) => /^[a-z0-9._-]+\.[a-z]{2,}$/.test(d);

  const fetchTokens = async () => {
    const t = await fetch(`${base}/api/v1/tokens`, { headers: { 'X-Api-Key': apiKey.trim() } });
    return await t.json().catch(() => []);
  };

  const testEndpoint = async (ep) => {
    if (!apiKey.trim()) return toast('Enter your API key first', 'error');
    const key = ep.method + ep.path;
    setTestingEndpoint(key);
    try {
      // Build path — use user-entered path params if provided, else auto-fetch real ones
      let testPath = ep.path;
      const params = pathParams[key] || {};
      const opts = { method: ep.method, headers: { 'X-Api-Key': apiKey.trim() } };

      // Generic path param replacement for user-entered values
      ['sub', 'id', 'domain', 'subdomain'].forEach((p) => {
        if (params[p] && testPath.includes(`{${p}}`)) {
          testPath = testPath.replace(`{${p}}`, encodeURIComponent(params[p]));
        }
      });

      // Auto-fetch real values for known endpoints if not user-provided
      if ((ep.path === '/manage/tunnels/{sub}/stop') && !params.sub) {
        const td = await fetchTokens();
        if (!td.live?.length) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: 'No live tunnels to stop. Start a tunnel first (see Quickstart), or enter a subdomain above.' }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        testPath = ep.path.replace('{sub}', td.live[0].subdomain);
      }

      // Domain endpoints — auto-fetch from /tokens
      if (ep.path === '/domains' && ep.method === 'GET') {
        const td = await fetchTokens();
        const domains = [];
        (td || []).forEach((tok) => {
          if (tok.custom_domain) domains.push({ domain: tok.custom_domain, token_id: tok.id, type: 'primary' });
          (tok.domains || []).forEach((d) => domains.push({ domain: d, token_id: tok.id, type: 'extra' }));
        });
        setResults((prev) => ({ ...prev, [key]: { ok: true, status: '200', data: domains, testedAt: new Date().toLocaleTimeString() } }));
        setTestingEndpoint(null);
        return;
      }

      if (ep.path === '/domains' && ep.method === 'POST') {
        const rawBody = requestBodies[key] ?? SAMPLE_BODIES[key];
        let parsed;
        try { parsed = JSON.parse(rawBody); } catch {
          toast('Invalid JSON in request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const domain = sanitizeDomain(parsed.domain);
        if (!domain || !isValidDomain(domain)) {
          toast('Enter a valid domain in the request body (e.g. mycompany.com)', 'error');
          setTestingEndpoint(null);
          return;
        }
        // Create a dedicated root-domain token (matches /dashboard/domains behavior)
        testPath = '/tokens';
        opts.method = 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify({ name: domain, custom_domain: domain });
      }

      if (ep.path === '/domains/{domain}' && ep.method === 'PUT') {
        const rawBody = requestBodies[key] ?? SAMPLE_BODIES[key];
        let parsed;
        try { parsed = JSON.parse(rawBody); } catch {
          toast('Invalid JSON in request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const newDomain = sanitizeDomain(parsed.new_domain);
        if (!newDomain || !isValidDomain(newDomain)) {
          toast('Enter a valid new_domain in the request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const domainToChange = sanitizeDomain(params.domain);
        if (!domainToChange) {
          toast('Enter the current domain in the path field above', 'error');
          setTestingEndpoint(null);
          return;
        }
        const td = await fetchTokens();
        const targetToken = (td || []).find((tok) => tok.custom_domain === domainToChange || (tok.domains || []).includes(domainToChange));
        if (!targetToken) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Domain "${domainToChange}" not found on any token.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        // Update the token's primary custom_domain (root domains are primary)
        testPath = `/tokens/${targetToken.id}`;
        opts.method = 'PUT';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify({ custom_domain: newDomain });
      }

      if (ep.path === '/domains/{domain}' && ep.method === 'DELETE') {
        const domainToDelete = sanitizeDomain(params.domain);
        if (!domainToDelete) {
          toast('Enter the domain to remove in the path field above', 'error');
          setTestingEndpoint(null);
          return;
        }
        const td = await fetchTokens();
        const targetToken = (td || []).find((tok) => tok.custom_domain === domainToDelete || (tok.domains || []).includes(domainToDelete));
        if (!targetToken) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Domain "${domainToDelete}" not found on any token.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        // Root domains are primary; clear the token's custom_domain
        testPath = `/tokens/${targetToken.id}`;
        opts.method = 'PUT';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify({ custom_domain: '' });
      }

      // Subdomain endpoints — auto-fetch from /tokens
      if (ep.path === '/subdomains' && ep.method === 'GET') {
        const td = await fetchTokens();
        const subdomains = [];
        const seen = new Set();
        const addSub = (full, type, tok) => {
          if (!full || seen.has(full)) return;
          seen.add(full);
          const parts = full.split('.');
          if (parts.length >= 3) {
            subdomains.push({
              subdomain: parts.slice(0, parts.length - 2).join('.'),
              domain: parts.slice(parts.length - 2).join('.'),
              token_id: tok.id,
              full_address: full,
              type
            });
          }
        };
        (td || []).forEach((tok) => {
          const root = tok.custom_domain || 'iraglobaltech.com';
          if (tok.fixed_subdomain) {
            subdomains.push({
              subdomain: tok.fixed_subdomain,
              domain: root,
              token_id: tok.id,
              full_address: `${tok.fixed_subdomain}.${root}`,
              type: 'fixed'
            });
          }
          if (tok.custom_domain) addSub(tok.custom_domain, 'primary', tok);
          (tok.domains || []).forEach((d) => addSub(d, 'extra', tok));
        });
        setResults((prev) => ({ ...prev, [key]: { ok: true, status: '200', data: subdomains, testedAt: new Date().toLocaleTimeString() } }));
        setTestingEndpoint(null);
        return;
      }

      if (ep.path === '/subdomains' && ep.method === 'POST') {
        const rawBody = requestBodies[key] ?? SAMPLE_BODIES[key];
        let parsed;
        try { parsed = JSON.parse(rawBody); } catch {
          toast('Invalid JSON in request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const sub = sanitizeSubdomain(parsed.subdomain);
        const domain = sanitizeDomain(parsed.domain);
        if (!sub || !domain || !isValidDomain(domain)) {
          toast('Enter valid subdomain and domain in the request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const td = await fetchTokens();
        // Find a token whose primary custom_domain is the root domain
        const rootDomain = domain.split('.').slice(-2).join('.');
        const targetToken = (td || []).find((tok) => tok.custom_domain === domain || tok.custom_domain === rootDomain);
        if (!targetToken) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Root domain "${rootDomain}" not found. Add it via POST /domains first.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        const fullSubdomain = `${sub}.${domain}`;
        // Security: prevent creating a subdomain that already exists on any token
        const exists = (td || []).some((tok) =>
          tok.fixed_subdomain === sub ||
          (tok.domains || []).includes(fullSubdomain) ||
          tok.custom_domain === fullSubdomain
        );
        if (exists) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Subdomain "${fullSubdomain}" already exists.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        testPath = `/tokens/${targetToken.id}/domains`;
        opts.method = 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify({ domain: fullSubdomain });
      }

      if (ep.path === '/subdomains/{subdomain}' && ep.method === 'PUT') {
        const rawBody = requestBodies[key] ?? SAMPLE_BODIES[key];
        let parsed;
        try { parsed = JSON.parse(rawBody); } catch {
          toast('Invalid JSON in request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const newSub = sanitizeSubdomain(parsed.new_subdomain);
        const domain = sanitizeDomain(parsed.domain);
        const oldSub = sanitizeSubdomain(params.subdomain);
        if (!newSub || !domain || !oldSub || !isValidDomain(domain)) {
          toast('Enter valid new_subdomain, domain, and subdomain path param', 'error');
          setTestingEndpoint(null);
          return;
        }
        const td = await fetchTokens();
        const fullOldSubdomain = `${oldSub}.${domain}`;
        const fullNewSubdomain = `${newSub}.${domain}`;
        const targetToken = (td || []).find((tok) => (tok.domains || []).includes(fullOldSubdomain));
        if (!targetToken) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Subdomain "${fullOldSubdomain}" not found.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        // Security: prevent collision with existing subdomain
        const exists = (td || []).some((tok) =>
          (tok.domains || []).includes(fullNewSubdomain) ||
          tok.custom_domain === fullNewSubdomain ||
          tok.fixed_subdomain === newSub
        );
        if (exists) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Subdomain "${fullNewSubdomain}" already exists.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        // Add new subdomain then delete old one
        const addResp = await fetch(`${base}/api/v1/tokens/${targetToken.id}/domains`, {
          method: 'POST',
          headers: { 'X-Api-Key': apiKey.trim(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: fullNewSubdomain })
        });
        if (!addResp.ok) {
          const err = await addResp.json().catch(() => ({}));
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: addResp.status, data: err, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        await fetch(`${base}/api/v1/tokens/${targetToken.id}/domains/${encodeURIComponent(fullOldSubdomain)}`, {
          method: 'DELETE',
          headers: { 'X-Api-Key': apiKey.trim() }
        });
        setResults((prev) => ({ ...prev, [key]: { ok: true, status: '200', data: { message: `Subdomain updated from ${fullOldSubdomain} to ${fullNewSubdomain}` }, testedAt: new Date().toLocaleTimeString() } }));
        setTestingEndpoint(null);
        return;
      }

      if (ep.path === '/subdomains/{subdomain}' && ep.method === 'DELETE') {
        const rawBody = requestBodies[key] ?? SAMPLE_BODIES[key];
        let parsed = {};
        try { parsed = JSON.parse(rawBody); } catch { /* body optional if domain provided via path */ }
        const domain = sanitizeDomain(parsed.domain);
        const sub = sanitizeSubdomain(params.subdomain);
        if (!sub || !domain || !isValidDomain(domain)) {
          toast('Enter valid subdomain path param and domain in the request body', 'error');
          setTestingEndpoint(null);
          return;
        }
        const td = await fetchTokens();
        const fullSubdomain = `${sub}.${domain}`;
        const targetToken = (td || []).find((tok) => (tok.domains || []).includes(fullSubdomain));
        if (!targetToken) {
          setResults((prev) => ({ ...prev, [key]: { ok: false, status: '—', data: { detail: `Subdomain "${fullSubdomain}" not found.` }, testedAt: new Date().toLocaleTimeString() } }));
          setTestingEndpoint(null);
          return;
        }
        testPath = `/tokens/${targetToken.id}/domains/${encodeURIComponent(fullSubdomain)}`;
        opts.method = 'DELETE';
      }

      const needsTokenId = ['/tokens/{id}', '/tokens/{id}/domains', '/tokens/{id}/regenerate'].some((p) => ep.path === p);
      if (needsTokenId && !params.id && testPath.includes('{id}')) {
        const td = await fetchTokens();
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

      // PUT/POST with body — use the user's editable JSON body
      const bodyKey = ep.method + ep.path;
      if ((ep.method === 'POST' || ep.method === 'PUT') && SAMPLE_BODIES[bodyKey] && !opts.body) {
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
          delete opts.headers['Content-Type'];
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

      {/* Full API documentation links */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header"><h2>📚 Full API Documentation</h2></div>
        <div className="card-body">
          <p className="dim" style={{ marginBottom: '.75rem' }}>Browse the complete interactive API reference — all 96 endpoints with request/response schemas, parameters, and examples.</p>
          <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
            <a className="btn btn-sm" href="/docs" target="_blank" rel="noreferrer">🔧 Swagger UI →</a>
          </div>
        </div>
      </div>

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

      {/* Endpoint cards — grouped into workflow sections */}
      {sections.map((section) => (
        <div key={section.id} className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h2>{section.title}</h2>
            <p className="dim" style={{ fontSize: '.85rem', margin: 0 }}>{section.subtitle}</p>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="apidocs-grid">
              {section.endpoints.map((ep) => {
                const key = ep.method + ep.path;
                const result = results[key];
                const isTesting = testingEndpoint === key;
                const hasBody = !!SAMPLE_BODIES[key];
                const hasParams = !!PATH_PARAMS[key];
                const isExpanded = expandedCard === key;
                return (
                  <div key={key} className="apidocs-card">
                    <div className="apidocs-card-header">
                      <span className={`badge ${ep.method === 'GET' ? 'badge-green' : ep.method === 'DELETE' ? 'badge-red' : ep.method === 'PATCH' ? 'badge-red' : 'badge-blue'}`}>{ep.method}</span>
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
                                  placeholder={
                                    param === 'sub'
                                      ? 'Leave empty to auto-use your first live tunnel'
                                      : param === 'domain'
                                      ? 'Enter a domain you own'
                                      : param === 'subdomain'
                                      ? 'Enter subdomain prefix'
                                      : param === 'new_subdomain'
                                      ? 'Enter new subdomain prefix'
                                      : 'Leave empty to auto-use your last token'
                                  }
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
          </div>
        </div>
      ))}
    </>
  );
}