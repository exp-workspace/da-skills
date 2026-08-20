/**
 * Host-side bridge for embedding the Experience Governance MFE's `embed`
 * entry via `@assets/microfrontend`'s MessageRpc protocol.
 *
 * Vanilla re-implementation: no Unified Shell, no React. The protocol, per
 * @assets/microfrontend's own rpcBridge:
 *  - handshake = '__connect'. BOTH sides invoke it unprompted; each answers
 *    the other's request with an invokeResponse.
 *  - host->mfe props: fnName 'reactSetProps', params:[{ simple, callbacks }].
 *    Function props are sent by NAME only, in `callbacks`.
 *  - mfe->host events: fnName 'reactCallback', params:[{ callbackName, args }].
 *    The host MUST reply or the MFE's promise hangs.
 */

import { EGOV_MFE } from '../constants.js';

const { CHANNEL, PROTOCOL, VERSION } = EGOV_MFE;
const LOCAL_VERSION = { internal: VERSION, consumer: '1.1' };

const HANDSHAKE_RETRY_MS = 300;
const HANDSHAKE_WINDOW_MS = 15000;

/**
 * Wire the MessageRpc bridge to an already-mounted iframe pointed at the MFE's
 * embed.html. The handshake retries until the MFE's own listener exists, since
 * it mounts React asynchronously after load.
 *
 * @param {object} opts
 * @param {HTMLIFrameElement} opts.iframe
 * @param {() => { path?: string, env?: string, imsToken?: string, imsOrg?: string }} opts.getProps
 * @param {(path: string) => void} [opts.onNavigate]
 * @returns {{ destroy: () => void }}
 */
export function setupEgovBridge({ iframe, getProps, onNavigate }) {
  let msgId = 0;
  const pending = new Map();
  let connected = false;
  let disposed = false;
  let retryTimer = null;
  let retryDeadline = null;

  /**
   * The props payload carries a live IMS bearer token, so both directions pin
   * to the embed's own origin: `'*'` would leak the token to whatever document
   * ends up in the frame, and `event.source` alone doesn't establish who that
   * document is. Null for an empty or unparseable src, which leaves the bridge
   * inert rather than insecure.
   */
  const targetOrigin = (() => {
    if (!iframe.src) return null;
    try {
      const { protocol, origin } = new URL(iframe.src, window.location.href);
      // Opaque origins (about:, data:, blob:) serialize to "null", which is not
      // a usable targetOrigin.
      return protocol === 'https:' || protocol === 'http:' ? origin : null;
    } catch {
      return null;
    }
  })();

  const post = (m) => {
    if (!targetOrigin) return;
    iframe.contentWindow?.postMessage(m, targetOrigin);
  };

  function invoke(fnName, params = []) {
    msgId += 1;
    const id = String(msgId);
    const message = {
      type: 'invokeRequest',
      channelId: CHANNEL,
      fnName,
      params,
      id,
      protocol: PROTOCOL,
      version: VERSION,
    };
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      post(message);
    });
  }

  function respond(request, value, isError = false) {
    post({
      type: isError ? 'invokeResponseError' : 'invokeResponse',
      channelId: CHANNEL,
      fnName: request.fnName,
      params: [value],
      id: request.id,
      protocol: PROTOCOL,
      version: VERSION,
    });
  }

  const handlers = {
    __connect() {
      markConnected();
      return LOCAL_VERSION;
    },
    reactCallback({ callbackName, args }) {
      if (callbackName === 'onNavigate') onNavigate?.(...(args || []));
      return undefined; // must still respond, or the MFE's promise hangs
    },
  };

  function onWindowMessage(event) {
    if (!targetOrigin || event.origin !== targetOrigin) return;
    if (event.source !== iframe.contentWindow) return;
    const d = event.data;
    if (!d || typeof d !== 'object' || d.protocol !== PROTOCOL) return;
    if (d.channelId !== CHANNEL) return;
    if (typeof d.version !== 'string' || !d.version.startsWith('1.')) return;

    if (d.type === 'invokeResponse' || d.type === 'invokeResponseError') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      const [value] = d.params || [];
      if (d.type === 'invokeResponse') p.resolve(value); else p.reject(value);
      return;
    }

    if (d.type === 'invokeRequest') {
      const fn = handlers[d.fnName];
      if (!fn) {
        respond(d, `Received request to invoke non-existing function: '${d.fnName}'.`, true);
        return;
      }
      Promise.resolve()
        .then(() => fn(...(d.params || [])))
        .then((v) => respond(d, v, false))
        .catch((e) => respond(d, String(e), true));
    }
  }

  function sendProps() {
    const { path = '/', env = 'PROD', imsToken, imsOrg } = getProps() || {};
    // `metrics` is deliberately absent: it isn't an MFE app prop but a
    // bridge-level field rpcBridge derives from window.adobeMetrics on the
    // sender side. Omitting it makes the guest skip MetricsWrapper.init;
    // sending `{}` would only feed it a bogus id.
    //
    // `colorScheme: 'light'` is not a guess — it matches the host, which pins
    // itself to light in skills.html (`:root { color-scheme: light }`) until the
    // editor's dark mode is finished. The two must be un-pinned together: drop
    // that rule without forwarding the real scheme here and the frame stays
    // light inside a dark panel. Forwarding it needs a `prefers-color-scheme`
    // listener plus a props resend when it flips.
    //
    // `en-US` likewise matches what the editor ships today (no i18n).
    const simple = {
      path, env, optIn: false, colorScheme: 'light', locale: 'en-US', featureFlags: [],
    };
    if (imsToken) simple.imsToken = imsToken;
    if (imsOrg) simple.imsOrg = imsOrg;
    // Only callbacks `reactCallback` actually handles are advertised. Listing
    // one we ignore is a contract we don't keep: the MFE may suppress its own
    // in-frame UI for an event it believes the host renders, so a dropped toast
    // becomes silence rather than a fallback. Add the name here and a branch in
    // `reactCallback` together, never one without the other.
    return invoke('reactSetProps', [{ simple, callbacks: ['onNavigate'] }]);
  }

  function markConnected() {
    if (connected) return;
    connected = true;
    clearInterval(retryTimer);
    retryTimer = null;
    sendProps();
  }

  window.addEventListener('message', onWindowMessage);

  /**
   * Unanswered attempts are left in `pending` on purpose: only the one that
   * lands gets a response, and they're bounded by the retry window and cleared
   * on destroy. Evicting the previous attempt could discard a response already
   * in flight for it.
   */
  const tryConnect = () => {
    if (connected || disposed) return;
    invoke('__connect', [LOCAL_VERSION]).then(markConnected).catch(() => {});
  };

  /** Opens (or re-opens) a retry window and connects now. Idempotent. */
  function startHandshake() {
    if (connected || disposed) return;
    retryDeadline = Date.now() + HANDSHAKE_WINDOW_MS;
    tryConnect();
    if (retryTimer) return;
    retryTimer = setInterval(() => {
      if (connected || disposed || Date.now() > retryDeadline) {
        clearInterval(retryTimer);
        retryTimer = null;
        return;
      }
      tryConnect();
    }, HANDSHAKE_RETRY_MS);
  }

  // Both entry points are needed. The frame may already have loaded by the time
  // the bridge is built, in which case `load` never fires and only this call
  // starts the handshake; posting early is harmless, since the pinned
  // targetOrigin doesn't match about:blank and a retry picks it up.
  startHandshake();

  // And a frame that loads slowly may burn the whole first window before its
  // document runs, so `load` re-opens one.
  iframe.addEventListener('load', startHandshake, { once: true });

  return {
    destroy() {
      disposed = true;
      clearInterval(retryTimer);
      window.removeEventListener('message', onWindowMessage);
      pending.clear();
    },
  };
}
