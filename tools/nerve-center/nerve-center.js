import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';

// NC API origin. Defaults to prod; override for local dev with ?nerve-center-api=http://localhost:3001
const DEFAULT_API_BASE_URL = 'https://d31bkz463thsuv.cloudfront.net';
const DA_ADMIN = 'https://admin.da.live';
const DA_CANVAS = 'https://da.live/canvas';

const REC_FILTERS = ['all', 'act', 'watch', 'ignore'];
const SORTS = ['severity', 'recent', 'title'];

function severityTier(sev) {
  if (sev == null) return null;
  if (sev >= 80) return 'Critical';
  if (sev >= 60) return 'High';
  if (sev >= 40) return 'Medium';
  return 'Low';
}

// Normalize an API observation into the shape the UI renders. `id` is the observation id
// (used for drafts keying); severity folds in the corroboration boost.
function normalize(o) {
  const sev = o.boostedSeverity ?? o.latestSeverity ?? null;
  return {
    id: o.observationId ?? o.id,
    eventId: o.id,
    title: o.title ?? '',
    summary: o.summary ?? '',
    description: o.description ?? '',
    subject: o.subject ?? '',
    brandName: o.brandName ?? '',
    severity: sev,
    tier: severityTier(sev),
    recommendation: (o.recommendation ?? '').toLowerCase() || null,
    impact: (o.impact ?? '').toLowerCase() || null,
    corroborated: !!o.corroborated,
    matchStatus: o.matchStatus ?? null,
    sources: Array.isArray(o.sources) ? o.sources : [],
    trackingTerms: Array.isArray(o.trackingTerms) ? o.trackingTerms : [],
    businessImpact: o.businessImpact ?? '',
    recommendedAction: o.recommendedAction ?? '',
    rationale: o.rationale ?? '',
    authoritativeSource: o.authoritativeSource ?? null,
    lastDetectedOn: o.lastDetectedOn ?? null,
    status: o.status ?? null,
  };
}

class NerveCenterApp extends LitElement {
  static properties = {
    _token: { state: true },
    _observations: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _drafts: { state: true },
    _completed: { state: true },
    _rec: { state: true },
    _sort: { state: true },
    _q: { state: true },
    _showFilters: { state: true },
    _expanded: { state: true },
  };

  constructor() {
    super();
    this._token = null;
    this._observations = [];
    this._loading = false;
    this._error = null;
    this._drafts = {};
    this._completed = new Set();
    this._rec = 'all';
    this._sort = 'severity';
    this._q = '';
    this._showFilters = false;
    this._expanded = new Set();
    // Non-reactive
    this._apiBase = DEFAULT_API_BASE_URL;
    this._actions = null;
    this._org = null;
    this._site = null;
    this._draftsStarted = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onAgentChange = (e) => {
      if (e.data?.type === 'nx-completed-obs') {
        const matched = (e.data.ids ?? []).filter((id) => this._observations.some((o) => o.id === id));
        if (matched.length) this._completed = new Set([...this._completed, ...matched]);
        return;
      }
      if (e.data?.action !== 'agentChange') return;
      const { detail } = e.data;
      if (detail?.scope !== 'file') return;
      const prefix = '/drafts/nerve-center/';
      for (const p of detail.paths ?? []) {
        const idx = p.indexOf(prefix);
        if (idx === -1) continue;
        const obsId = p.slice(idx + prefix.length).split('/')[0];
        if (obsId && this._observations.some((o) => o.id === obsId)) this._fetchDrafts(obsId);
      }
    };
    window.addEventListener('message', this._onAgentChange);
    this._init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('message', this._onAgentChange);
  }

  async _init() {
    const params = new URLSearchParams(window.location.search);
    const apiOverride = params.get('nerve-center-api');
    if (apiOverride) this._apiBase = apiOverride.replace(/\/$/, '');

    try {
      const stored = sessionStorage.getItem('nc-completed');
      if (stored) this._completed = new Set(JSON.parse(stored));
    } catch {
      /* ignore */
    }

    try {
      const { token, actions, project } = await DA_SDK;
      this._token = token;
      this._actions = actions;
      this._org = project?.org;
      this._site = project?.repo;
    } catch {
      // SDK unavailable in standalone/dev
    }

    if (this._token) this._fetchObservations();
  }

  async _fetchObservations() {
    if (!this._token) return;
    this._loading = true;
    this._error = null;
    try {
      // Org-implicit endpoint: the customer is derived from the IMS token server-side.
      const resp = await fetch(`${this._apiBase}/api/observations?pageSize=50`, {
        headers: { Authorization: `Bearer ${this._token}` },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const { data } = await resp.json();
      this._observations = (data.observations ?? []).map(normalize);
      this._checkFetchDrafts();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  _checkFetchDrafts() {
    if (this._actions && this._org && this._site && this._observations.length > 0 && !this._draftsStarted) {
      this._draftsStarted = true;
      Promise.all(this._observations.map((o) => this._fetchDrafts(o.id)));
    }
  }

  async _fetchDrafts(obsId) {
    this._drafts = { ...this._drafts, [obsId]: { loading: true, items: [] } };
    try {
      const url = `${DA_ADMIN}/list/${this._org}/${this._site}/drafts/nerve-center/${obsId}`;
      const resp = await this._actions.daFetch(url);
      if (!resp.ok) {
        this._drafts = { ...this._drafts, [obsId]: { loading: false, items: [] } };
        return;
      }
      const payload = await resp.json();
      const items = Array.isArray(payload) ? payload.filter((i) => i.ext) : [];
      this._drafts = { ...this._drafts, [obsId]: { loading: false, items } };
    } catch {
      this._drafts = { ...this._drafts, [obsId]: { loading: false, items: [] } };
    }
  }

  _buildPrompt(o) {
    const lines = [
      `Observation: ${o.title}`,
      o.summary ? `Summary: ${o.summary}` : null,
      o.impact ? `Impact: ${o.impact}` : null,
      o.recommendation ? `Recommendation: ${o.recommendation}` : null,
      o.recommendedAction ? `Recommended action: ${o.recommendedAction}` : null,
      o.businessImpact ? `Business impact: ${o.businessImpact}` : null,
    ].filter(Boolean);
    return [
      lines.join('\n'),
      '',
      'Based on this observation, generate three pages that can help drive traffic or conversions on our website.',
      `Create 3 different variations of content based on the observation at /drafts/nerve-center/${o.id}/`,
    ].join('\n');
  }

  _renderWithLinks(text) {
    const parts = [];
    const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (match.index > last) parts.push(text.slice(last, match.index));
      parts.push(html`<a href=${match[2]} target="_blank" rel="noopener noreferrer">${match[1]}</a>`);
      last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  _toast(message) {
    const el = document.createElement('div');
    el.className = 'nc-toast';
    el.textContent = message;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('nc-toast--visible'));
    setTimeout(() => {
      el.classList.remove('nc-toast--visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 2500);
  }

  _toggleComplete(obsId) {
    const next = new Set(this._completed);
    if (next.has(obsId)) next.delete(obsId);
    else next.add(obsId);
    this._completed = next;
    try {
      sessionStorage.setItem('nc-completed', JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }

  _toggleExpanded(obsId) {
    const next = new Set(this._expanded);
    if (next.has(obsId)) next.delete(obsId);
    else next.add(obsId);
    this._expanded = next;
  }

  _canvasUrl(item) {
    const hash = item.ext ? item.path.slice(1, -(item.ext.length + 1)) : item.path.replace(/^\//, '');
    return `${DA_CANVAS}#/${hash}`;
  }

  _draftName(item) {
    const seg = item.path.split('/').pop() ?? '';
    const base = item.ext ? seg.slice(0, -(item.ext.length + 1)) : seg;
    return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  _renderDrafts(obsId) {
    const entry = this._drafts[obsId];
    if (!entry) return nothing;
    if (entry.loading) return html`<p class="drafts-loading">Loading drafts…</p>`;
    if (entry.items.length === 0) return nothing;
    return html`
      <div class="drafts">
        <p class="obs-detail-label">Draft content</p>
        <ul class="drafts-list">
          ${entry.items.map(
            (item) => html`<li>
              <a class="draft-link" href=${this._canvasUrl(item)} target="_blank">${this._draftName(item)}</a>
            </li>`
          )}
        </ul>
        <sl-button
          class="ew-outline-accent nc-preview-btn"
          @click=${() =>
            window.parent.postMessage(
              { type: 'nx-show-draft-preview', obsId, items: entry.items, org: this._org, site: this._site },
              '*'
            )}
          >Compare drafts</sl-button
        >
      </div>`;
  }

  _renderGenerateButton(o) {
    const drafts = this._drafts[o.id];
    if (drafts?.loading || (drafts && drafts.items.length > 0)) return nothing;
    return html`
      <sl-button
        class="ew-fill-accent obs-chat-btn"
        @click=${() => {
          window.parent.postMessage({ type: 'nx-open-chat' }, '*');
          const prompt = this._buildPrompt(o);
          if (this._actions?.setPrompt) this._actions.setPrompt(prompt, { autoSend: true });
          else navigator.clipboard?.writeText(prompt).then(() => this._toast('Prompt copied to clipboard'));
        }}
        >Generate content</sl-button
      >`;
  }

  _pill(text, kind) {
    return html`<span class="nc-pill nc-pill--${kind}">${text}</span>`;
  }

  _visibleObservations() {
    const q = this._q.trim().toLowerCase();
    let rows = this._observations
      .filter((o) => !this._completed.has(o.id))
      .filter((o) => this._rec === 'all' || o.recommendation === this._rec)
      .filter((o) => !q || `${o.title} ${o.summary} ${o.subject} ${o.brandName}`.toLowerCase().includes(q));
    if (this._sort === 'severity') rows = rows.sort((a, b) => (b.severity ?? -1) - (a.severity ?? -1));
    else if (this._sort === 'recent') rows = rows.sort((a, b) => String(b.lastDetectedOn).localeCompare(String(a.lastDetectedOn)));
    else rows = rows.sort((a, b) => a.title.localeCompare(b.title));
    return rows;
  }

  _renderToolbar() {
    const activeFilters = (this._rec !== 'all' ? 1 : 0) + (this._q ? 1 : 0);
    return html`
      <div class="nc-toolbar">
        <div class="nc-search">
          <input
            type="search"
            placeholder="Search trends"
            .value=${this._q}
            @input=${(e) => {
              this._q = e.target.value;
            }}
          />
        </div>
        <button
          class="nc-filter-toggle ${this._showFilters ? 'is-open' : ''}"
          aria-label="Show filters and sorting"
          @click=${() => {
            this._showFilters = !this._showFilters;
          }}
        >
          Filters${activeFilters ? html` <span class="nc-filter-count">${activeFilters}</span>` : nothing}
        </button>
      </div>
      ${this._showFilters
        ? html`
            <div class="nc-controls">
              <div class="nc-control-row">
                <span class="nc-control-label">Show</span>
                ${REC_FILTERS.map(
                  (r) => html`<button
                    class="nc-chip ${this._rec === r ? 'is-active' : ''}"
                    @click=${() => {
                      this._rec = r;
                    }}
                  >
                    ${r === 'all' ? 'All' : r[0].toUpperCase() + r.slice(1)}
                  </button>`
                )}
              </div>
              <div class="nc-control-row">
                <span class="nc-control-label">Sort</span>
                ${SORTS.map(
                  (s) => html`<button
                    class="nc-chip ${this._sort === s ? 'is-active' : ''}"
                    @click=${() => {
                      this._sort = s;
                    }}
                  >
                    ${s === 'severity' ? 'Severity' : s === 'recent' ? 'Most recent' : 'A–Z'}
                  </button>`
                )}
              </div>
            </div>
          `
        : nothing}
    `;
  }

  _renderCard(o) {
    const open = this._expanded.has(o.id);
    return html`
      <div class="card observation-item ${open ? 'is-open' : ''}">
        <div class="obs-clickable" @click=${() => this._toggleExpanded(o.id)}>
          <div class="obs-meta">
            ${o.tier ? this._pill(`${o.severity} · ${o.tier}`, `tier-${o.tier.toLowerCase()}`) : nothing}
            ${o.recommendation ? this._pill(o.recommendation[0].toUpperCase() + o.recommendation.slice(1), `rec-${o.recommendation}`) : nothing}
            ${o.impact ? this._pill(o.impact[0].toUpperCase() + o.impact.slice(1), `impact-${o.impact}`) : nothing}
            ${o.corroborated ? this._pill('Corroborated', 'corr') : nothing}
          </div>
          <p class="obs-name">${o.title}</p>
          <p class="obs-sub">${[o.subject, o.brandName, o.sources.join(', ')].filter(Boolean).join(' · ')}</p>
          ${o.summary ? html`<p class="obs-description">${this._renderWithLinks(o.summary)}</p>` : nothing}
        </div>
        ${open
          ? html`
              <div class="obs-detail">
                ${o.businessImpact ? html`<div><p class="obs-detail-label">Business impact</p><p>${o.businessImpact}</p></div>` : nothing}
                ${o.recommendedAction ? html`<div><p class="obs-detail-label">Recommended action</p><p>${o.recommendedAction}</p></div>` : nothing}
                ${o.rationale ? html`<div><p class="obs-detail-label">Rationale</p><p>${this._renderWithLinks(o.rationale)}</p></div>` : nothing}
                ${o.trackingTerms.length ? html`<p class="obs-terms">${o.trackingTerms.map((t) => html`<span class="nc-term">${t}</span>`)}</p>` : nothing}
                ${o.authoritativeSource?.url
                  ? html`<a class="obs-source" href=${o.authoritativeSource.url} target="_blank" rel="noopener noreferrer"
                      >${o.authoritativeSource.publication || o.authoritativeSource.title || 'Source'} ↗</a
                    >`
                  : nothing}
                ${this._renderDrafts(o.id)} ${this._renderGenerateButton(o)}
                <button class="obs-complete-btn" @click=${() => this._toggleComplete(o.id)}>Mark done</button>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  _renderContent() {
    if (!this._token) {
      return html`<div class="card"><p>Sign in to Experience Workspace to see your organization's trends.</p></div>`;
    }
    if (this._loading) {
      return html`<div class="card">
        <sl-skeleton effect="pulse" style="height:56px;margin-bottom:12px;"></sl-skeleton>
        <sl-skeleton effect="pulse" style="height:56px;margin-bottom:12px;"></sl-skeleton>
        <sl-skeleton effect="pulse" style="height:56px;"></sl-skeleton>
      </div>`;
    }
    if (this._error) {
      return html`<div class="card error">
        <p>Couldn't load trends: ${this._error}</p>
        <sl-button class="ew-fill-accent" @click=${() => this._fetchObservations()}>Retry</sl-button>
      </div>`;
    }
    if (this._observations.length === 0) {
      return html`<div class="card"><p>No trends for your organization yet.</p></div>`;
    }
    const rows = this._visibleObservations();
    const done = this._observations.filter((o) => this._completed.has(o.id));
    return html`
      ${this._renderToolbar()}
      <p class="nc-count">${rows.length} of ${this._observations.length}</p>
      ${rows.length
        ? rows.map((o) => this._renderCard(o))
        : html`<div class="card"><p>No matching trends.</p></div>`}
      ${done.length
        ? html`<p class="completed-label">Completed</p>
            ${done.map(
              (o) => html`<div class="card observation-item obs-completed">
                <div class="obs-header">
                  <p class="obs-name"><span class="obs-check">✓</span>${o.title}</p>
                  <button class="obs-complete-btn obs-complete-btn--done" @click=${() => this._toggleComplete(o.id)}>Undo</button>
                </div>
              </div>`
            )}`
        : nothing}
    `;
  }

  render() {
    return html`
      <div class="app-header">
        <h3>Trend Identifier</h3>
      </div>
      ${this._renderContent()}
    `;
  }
}

customElements.define('nerve-center-app', NerveCenterApp);
