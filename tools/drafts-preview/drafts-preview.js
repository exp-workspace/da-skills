import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html } from 'da-lit';

const STORAGE_KEY = 'da-drafts-preview';
const CHANNEL_NAME = 'da-drafts-preview';

async function livePreviewLogin(org, repo, token) {
  try {
    await fetch(`https://main--${repo}--${org}.preview.da.live/gimme_cookie`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('Live Preview Login failed', e);
  }
}

class DraftsPreviewApp extends LitElement {
  static properties = {
    _items: { state: true },
    _activeTab: { state: true },
  };

  constructor() {
    super();
    this._items = [];
    this._activeTab = 0;
    this._org = null;
    this._site = null;
    this._actions = null;
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();

    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (stored?.items?.length) {
        this._items = stored.items;
        this._org = stored.org;
        this._site = stored.site;
      }
    } catch { /* ignore */ }

    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = ({ data }) => {
      this._items = data.items ?? [];
      this._org = data.org;
      this._site = data.site;
      this._activeTab = 0;
    };

    DA_SDK.then(({ token, actions, project }) => {
      this._actions = actions;
      if (token && project?.org && project?.repo) {
        livePreviewLogin(project.org, project.repo, token);
      }
    }).catch(() => { });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._channel.close();
  }

  _previewUrl(item) {
    if (!this._org || !this._site) return '';
    const prefix = `/${this._org}/${this._site}`;
    const rel = item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.path;
    const withoutExt = item.ext ? rel.slice(0, -(item.ext.length + 1)) : rel;
    return `https://main--${this._site}--${this._org}.preview.da.live${withoutExt}`;
  }

  _openInCanvas(item) {
    const hash = item.ext
      ? item.path.slice(1, -(item.ext.length + 1))
      : item.path.replace(/^\//, '');
    this._actions?.setHash(`/${hash}`);
    this._actions?.closeLibrary();
  }

  render() {
    if (!this._items.length) {
      return html`<p class="dp-empty">Select "Preview drafts" in Nerve Center to preview content here.</p>`;
    }
    return html`
      <div class="dp-tabs" role="tablist">
        ${this._items.map((item, i) => html`
          <button role="tab" class="dp-tab ${i === this._activeTab ? 'dp-tab--active' : ''}"
            @click=${() => { this._activeTab = i; }}>
            ${item.name}
          </button>
        `)}
      </div>
      <div class="dp-panels">
        ${this._items.map((item, i) => html`
          <div class="dp-panel ${i === this._activeTab ? 'dp-panel--active' : ''}">
            <div class="dp-panel-inner">
              <iframe class="dp-frame" src=${this._previewUrl(item)} title=${item.name}></iframe>
              <div class="dp-actions">
                <sl-button class="ew-fill-accent" @click=${() => this._openInCanvas(item)}>
                  Edit in Canvas
                </sl-button>
              </div>
            </div>
          </div>
        `)}
      </div>
    `;
  }
}

customElements.define('drafts-preview-app', DraftsPreviewApp);
