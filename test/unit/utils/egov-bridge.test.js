import { expect } from '@esm-bundle/chai';
import { setupEgovBridge } from '../../../blocks/skills/utils/egov-bridge.js';
import { EGOV_MFE } from '../../../blocks/skills/constants.js';

const { CHANNEL, PROTOCOL } = EGOV_MFE;

const realPostMessage = window.postMessage.bind(window);

/**
 * The bridge only touches `src`, `contentWindow` and `addEventListener`, so a
 * stub is enough, and it lets each test control the `load` event precisely.
 *
 * `contentWindow` must be the test window itself, because the bridge rejects
 * any message whose `event.source` isn't that exact window and `MessageEvent`
 * won't carry a plain object as `source`. Outbound posts are therefore captured
 * by patching `window.postMessage` (recorded, not dispatched, so the bridge
 * never receives its own requests), while `respondTo` impersonates the MFE
 * through the unpatched original.
 */
function stubIframe() {
  const posted = [];
  let loadListener = null;
  window.postMessage = (m) => posted.push(m);
  return {
    posted,
    fireLoad() { loadListener?.(); },
    src: window.location.href,
    contentWindow: window,
    addEventListener(type, fn) { if (type === 'load') loadListener = fn; },
  };
}

const connectRequests = (iframe) => iframe.posted.filter((m) => m.fnName === '__connect' && m.type === 'invokeRequest');
const propsRequests = (iframe) => iframe.posted.filter((m) => m.fnName === 'reactSetProps');

/** Impersonate the MFE answering a host invokeRequest. */
function respondTo(request, value) {
  realPostMessage({
    type: 'invokeResponse',
    channelId: CHANNEL,
    fnName: request.fnName,
    params: [value],
    id: request.id,
    protocol: PROTOCOL,
    version: '1.0.0',
  }, window.location.origin);
}

/** Let queued message events and their promise chains settle. */
const settle = () => new Promise((r) => { setTimeout(r, 50); });

describe('setupEgovBridge', () => {
  let bridge;

  afterEach(() => {
    bridge?.destroy();
    bridge = null;
    window.postMessage = realPostMessage;
  });

  it('starts the handshake without waiting for the iframe load event', () => {
    const iframe = stubIframe();
    bridge = setupEgovBridge({ iframe, getProps: () => ({}) });

    // The host mounts the bridge after awaiting the IMS profile, by which point
    // the frame may already have loaded. If `load` were the only trigger, the
    // handshake would never start and the tab would stay blank.
    expect(connectRequests(iframe).length).to.equal(1);
  });

  it('still connects when load fires after mount', async () => {
    const iframe = stubIframe();
    bridge = setupEgovBridge({ iframe, getProps: () => ({}) });
    iframe.fireLoad();
    await settle();

    expect(connectRequests(iframe).length).to.be.greaterThan(1);
  });

  it('sends props once the MFE answers the handshake', async () => {
    const iframe = stubIframe();
    bridge = setupEgovBridge({
      iframe,
      getProps: () => ({ path: '/brands/1', env: 'QA', imsToken: 't', imsOrg: 'org@AdobeOrg' }),
    });
    respondTo(connectRequests(iframe)[0], { internal: '1.0.0', consumer: '1.1' });
    await settle();

    const [props] = propsRequests(iframe);
    expect(props).to.exist;
    const [{ simple, callbacks }] = props.params;
    expect(simple.path).to.equal('/brands/1');
    expect(simple.env).to.equal('QA');
    expect(simple.imsToken).to.equal('t');
    expect(simple.imsOrg).to.equal('org@AdobeOrg');
    // Only what `reactCallback` actually handles: advertising a callback the
    // host ignores can make the MFE suppress its own in-frame UI for it.
    expect(callbacks).to.deep.equal(['onNavigate']);
  });

  it('reports the MFE\'s navigation through onNavigate', async () => {
    const iframe = stubIframe();
    const navigated = [];
    bridge = setupEgovBridge({
      iframe,
      getProps: () => ({}),
      onNavigate: (path) => navigated.push(path),
    });
    realPostMessage({
      type: 'invokeRequest',
      channelId: CHANNEL,
      fnName: 'reactCallback',
      params: [{ callbackName: 'onNavigate', args: ['/brands/1/knowledge'] }],
      id: 'mfe-1',
      protocol: PROTOCOL,
      version: '1.0.0',
    }, window.location.origin);
    await settle();

    expect(navigated).to.deep.equal(['/brands/1/knowledge']);
  });

  it('stops retrying after destroy', async () => {
    const iframe = stubIframe();
    bridge = setupEgovBridge({ iframe, getProps: () => ({}) });
    bridge.destroy();
    const atDestroy = connectRequests(iframe).length;
    await settle();

    expect(connectRequests(iframe).length).to.equal(atDestroy);
  });

  it('drops messages from an origin other than the iframe\'s', async () => {
    // The pinned-origin check is what keeps the IMS token in. A document that
    // isn't the embed must not be able to answer the handshake and draw the
    // props payload out of the host, nor steer it with a faked navigation.
    // Here the frame is pinned to experience.adobe.com while the messages come
    // from the test page's own origin, so every one of them must be ignored.
    const iframe = { ...stubIframe(), src: 'https://experience.adobe.com/embed.html' };
    const navigated = [];
    bridge = setupEgovBridge({
      iframe,
      getProps: () => ({ imsToken: 'secret-token' }),
      onNavigate: (path) => navigated.push(path),
    });

    respondTo(connectRequests(iframe)[0], { internal: '1.0.0', consumer: '1.1' });
    realPostMessage({
      type: 'invokeRequest',
      channelId: CHANNEL,
      fnName: 'reactCallback',
      params: [{ callbackName: 'onNavigate', args: ['/brands/evil'] }],
      id: 'spoof-1',
      protocol: PROTOCOL,
      version: '1.0.0',
    }, window.location.origin);
    await settle();

    expect(navigated).to.be.empty;
    expect(propsRequests(iframe)).to.be.empty;
    expect(JSON.stringify(iframe.posted)).to.not.contain('secret-token');
  });

  it('is inert when the iframe src has no usable origin', () => {
    // The props payload carries a live IMS token, so a bridge with no origin to
    // pin postMessage to must send nothing rather than fall back to '*'.
    const iframe = { ...stubIframe(), src: '' };
    bridge = setupEgovBridge({ iframe, getProps: () => ({}) });

    expect(iframe.posted.length).to.equal(0);
  });
});
