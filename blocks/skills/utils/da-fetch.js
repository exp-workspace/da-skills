/**
 * Authenticated fetch for DA services.
 *
 * Unlike the da-nx version, this does NOT import IMS or nx.js.
 * The token is provided once by the DA App SDK (via skills.js bootstrap)
 * and reused for all subsequent requests.
 */

const AEM_ORIGIN = 'https://admin.hlx.page';

const TOKEN_URL_PREFIXES = [
  'https://admin.da.live',
  'https://stage-admin.da.live',
  'http://localhost:8787',
  'https://content.da.live',
  'https://stage-content.da.live',
  'http://localhost:8788',
];

let _token = null;

/**
 * Called once at boot with the IMS token from the DA App SDK.
 * @param {string} token
 */
export function initAuth(token) {
  _token = token;
}

function resolveOrigin() {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('da-admin');
  if (override === 'local') return 'http://localhost:8787';
  if (override === 'stage') return 'https://stage-admin.da.live';
  return 'https://admin.da.live';
}

export const DA_ORIGIN = resolveOrigin();

function shouldAttachToken(url) {
  try {
    const resolved = new URL(url, window.location.href).href;
    if (resolved.startsWith(AEM_ORIGIN)) return true;
    return TOKEN_URL_PREFIXES.some((prefix) => resolved.startsWith(prefix));
  } catch {
    return false;
  }
}

/**
 * Fetch with optional IMS bearer for DA admin / content / AEM URLs.
 * @param {string} url
 * @param {RequestInit} [opts]
 * @returns {Promise<Response>}
 */
export function getToken() {
  if (_token) return _token;
  try { return window.adobeIMS?.getAccessToken()?.token; } catch { return null; }
}

/**
 * da-live boots IMS asynchronously and doesn't wait for it before loading blocks
 * (see da-live/scripts/scripts.js), so getToken()'s single synchronous read can
 * come back empty for a beat after decorate() runs even when the user is signed
 * in. Poll briefly instead — mirrors da-live's own getAuthToken() gating logic.
 */
export async function waitForImsToken(timeoutMs = 4000) {
  const existing = getToken();
  if (existing) return existing;
  if (!localStorage.getItem('nx-ims')) return null;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    const token = getToken();
    if (token) return token;
  }
  return null;
}

export async function daFetch(url, opts = {}) {
  const nextOpts = {
    ...opts,
    headers: { ...(opts.headers || {}) },
  };

  const token = getToken();
  if (token && shouldAttachToken(url)) {
    nextOpts.headers.Authorization = `Bearer ${token}`;
    if (typeof url === 'string' && url.startsWith(AEM_ORIGIN)) {
      nextOpts.headers['x-content-source-authorization'] = `Bearer ${token}`;
    }
  }

  let resp;
  try {
    resp = await fetch(url, nextOpts);
  } catch (err) {
    resp = new Response(null, { status: 500, statusText: String(err?.message || err) });
  }

  return resp;
}
