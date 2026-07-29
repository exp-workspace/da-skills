import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';

// NC API origin. Defaults to prod; override for local dev with ?nerve-center-api=http://localhost:3001
const DEFAULT_API_BASE_URL = 'https://d31bkz463thsuv.cloudfront.net';
const DA_ADMIN = 'https://admin.da.live';
const DA_CANVAS = 'https://da.live/canvas';

const REC_FILTERS = ['all', 'act', 'watch', 'ignore'];
const SORTS = ['severity', 'recent', 'title'];
const PAGE_SIZE = 50;

// Origins allowed to postMessage into this app. The tool runs in a DA-hosted
// iframe, so trusted messages come from the DA host (da.live) or, in local dev,
// a localhost DA. Anything else is ignored.
function isTrustedMessageOrigin(origin) {
  if (origin === 'https://da.live') return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

// AI "sparkle / stardust" glyph — a large 4-point star with a small companion.
const sparkleIcon = () => html`
  <svg class="nc-sparkle" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2c.4 3.9 2.1 5.6 6 6-3.9.4-5.6 2.1-6 6-.4-3.9-2.1-5.6-6-6 3.9-.4 5.6-2.1 6-6Z" />
    <path d="M18.5 13c.2 1.9 1.1 2.8 3 3-1.9.2-2.8 1.1-3 3-.2-1.9-1.1-2.8-3-3 1.9-.2 2.8-1.1 3-3Z" />
  </svg>
`;

// Plain checkmark for the "mark done" affordance.
const checkIcon = () => html`
  <svg class="nc-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 13l4 4L19 7" />
  </svg>
`;

// Down chevron for the expand/collapse affordance (rotates 180° when open).
const chevronIcon = () => html`
  <svg class="nc-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
`;

// Cross for the "dismiss / not relevant" affordance.
const closeIcon = () => html`
  <svg class="nc-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
`;

// Human-readable labels for detection sources; unknown values are title-cased.
const SOURCE_LABELS = {
  google_trends: 'Google Trends',
  news: 'News',
  reddit: 'Reddit',
  youtube: 'YouTube',
};
const sourceLabel = (s) =>
  SOURCE_LABELS[s] || String(s).replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const sourceKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

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
    _total: { state: true },
    _loadingMore: { state: true },
    _loading: { state: true },
    _error: { state: true },
    _drafts: { state: true },
    _outcomes: { state: true },
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
    this._total = 0;
    this._loadingMore = false;
    this._loading = false;
    this._error = null;
    this._drafts = {};
    this._outcomes = {}; // { [obsId]: 'acted' | 'dismissed' }
    this._rec = 'all';
    this._sort = 'severity';
    this._q = '';
    this._showFilters = false;
    this._expanded = new Set();
    // Non-reactive
    this._apiBase = DEFAULT_API_BASE_URL;
    this._actions = null;
    this._org = null; // DA project org (slug), used for drafts
    this._site = null; // DA project repo (slug), used for drafts
    this._orgId = null; // NC organization id, resolved from the token via /api/me
    this._page = 1; // last-loaded observations page (for "Load more")
    this._draftsStarted = false;
  }

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this._onAgentChange = (e) => {
      if (!isTrustedMessageOrigin(e.origin)) return;
      // The host only pushes `agentChange` to the iframe; completion is a manual
      // outcome via the "Mark as acted" control, not a host-emitted signal.
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
      const stored = sessionStorage.getItem('nc-outcomes');
      if (stored) this._outcomes = JSON.parse(stored) || {};
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

  // Resolve (and cache) the caller's NC organization from the IMS token.
  // The backend resolves the token to exactly one org and returns it on /api/me.
  async _resolveOrgId() {
    if (this._orgId) return this._orgId;
    const resp = await fetch(`${this._apiBase}/api/me`, {
      headers: { Authorization: `Bearer ${this._token}` },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { data } = await resp.json();
    if (!data?.orgId) {
      throw new Error('No organization is associated with this account.');
    }
    this._orgId = data.orgId;
    return this._orgId;
  }

  // Fetch a single page of observations from the org-scoped endpoint.
  async _fetchPage(page) {
    const orgId = await this._resolveOrgId();
    const resp = await fetch(
      `${this._apiBase}/api/orgs/${orgId}/observations?page=${page}&pageSize=${PAGE_SIZE}`,
      { headers: { Authorization: `Bearer ${this._token}` } }
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const { data } = await resp.json();
    return {
      observations: (data.observations ?? []).map(normalize),
      total: data.total ?? (data.observations ?? []).length,
    };
  }

  async _fetchObservations() {
    if (!this._token) return;
    this._loading = true;
    this._error = null;
    try {
      // Discover the org once via /api/me, then use the org-scoped observations endpoint.
      const { observations, total } = await this._fetchPage(1);
      this._observations = observations;
      this._total = total;
      this._page = 1;
      this._checkFetchDrafts();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loading = false;
    }
  }

  // Append the next page. The backend reports `total`, so we can keep loading
  // until every observation is reachable rather than silently capping at PAGE_SIZE.
  async _loadMore() {
    if (this._loadingMore || this._observations.length >= this._total) return;
    this._loadingMore = true;
    try {
      const { observations, total } = await this._fetchPage(this._page + 1);
      this._observations = [...this._observations, ...observations];
      this._total = total;
      this._page += 1;
      this._checkFetchDrafts();
    } catch (err) {
      this._error = err.message;
    } finally {
      this._loadingMore = false;
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

  // Record the user's outcome for an observation ('acted' | 'dismissed').
  // Clicking the same outcome again clears it (toggle off).
  _setOutcome(obsId, outcome) {
    const next = { ...this._outcomes };
    if (next[obsId] === outcome) delete next[obsId];
    else next[obsId] = outcome;
    this._outcomes = next;
    this._persistOutcomes();
  }

  _clearOutcome(obsId) {
    const next = { ...this._outcomes };
    delete next[obsId];
    this._outcomes = next;
    this._persistOutcomes();
  }

  _persistOutcomes() {
    try {
      sessionStorage.setItem('nc-outcomes', JSON.stringify(this._outcomes));
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

  // Hand off the drafts to the drafts-preview tool, then ask the host to open it.
  // The receiver reads localStorage['da-drafts-preview'] on mount; showPanel routes
  // through the host (PANEL_EVENT.OPEN) — a raw window.postMessage never reaches it.
  _openDraftsPreview(items) {
    try {
      localStorage.setItem(
        'da-drafts-preview',
        JSON.stringify({ items, org: this._org, site: this._site }),
      );
    } catch {
      /* ignore quota/serialization errors */
    }
    this._actions?.showPanel?.('drafts-preview');
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
          @click=${() => this._openDraftsPreview(entry.items)}
          >Compare drafts</sl-button
        >
      </div>`;
  }

  _renderGenerateButton(o) {
    const drafts = this._drafts[o.id];
    if (drafts?.loading || (drafts && drafts.items.length > 0)) return nothing;
    return html`
      <button
        type="button"
        class="obs-generate-btn"
        @click=${() => {
          const prompt = this._buildPrompt(o);
          // setPrompt opens the chat panel host-side and sets the prompt (relayed to
          // nx-open-chat-panel), so no separate open-chat message is needed.
          if (this._actions?.setPrompt) this._actions.setPrompt(prompt, { autoSend: true });
          else navigator.clipboard?.writeText(prompt).then(() => this._toast('Prompt copied to clipboard'));
        }}
      >
        ${sparkleIcon()} Generate content
      </button>`;
  }

  _pill(text, kind) {
    return html`<span class="nc-pill nc-pill--${kind}">${text}</span>`;
  }

  _visibleObservations() {
    const q = this._q.trim().toLowerCase();
    let rows = this._observations
      // The org endpoint returns observations of every match status by default and
      // already applies the server-side corroboration promotion gate. Show those
      // corroborated observations, hiding only ones a reviewer has explicitly rejected.
      .filter((o) => o.matchStatus !== 'rejected')
      .filter((o) => !this._outcomes[o.id])
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
        <div class="obs-outcome-actions">
          <button
            type="button"
            class="obs-outcome-btn obs-outcome-btn--acted"
            title="Acted — I took action on this"
            aria-label="Mark as acted"
            @click=${(e) => {
              e.stopPropagation();
              this._setOutcome(o.id, 'acted');
            }}
          >
            ${checkIcon()}
          </button>
          <button
            type="button"
            class="obs-outcome-btn obs-outcome-btn--dismiss"
            title="Dismiss — not relevant"
            aria-label="Dismiss"
            @click=${(e) => {
              e.stopPropagation();
              this._setOutcome(o.id, 'dismissed');
            }}
          >
            ${closeIcon()}
          </button>
        </div>
        <div class="obs-clickable" @click=${() => this._toggleExpanded(o.id)}>
          <div class="obs-meta">
            ${o.tier ? this._pill(`${o.severity} · ${o.tier}`, `tier-${o.tier.toLowerCase()}`) : nothing}
            ${o.recommendation ? this._pill(o.recommendation[0].toUpperCase() + o.recommendation.slice(1), `rec-${o.recommendation}`) : nothing}
            ${o.impact ? this._pill(o.impact[0].toUpperCase() + o.impact.slice(1), `impact-${o.impact}`) : nothing}
          </div>
          ${o.brandName ? html`<p class="obs-brand">${o.brandName}</p>` : nothing}
          <p class="obs-name">${o.title}</p>
          ${o.sources.length
            ? html`<div class="obs-sources">
                ${o.sources.map(
                  (s) => html`<span class="nc-source-chip nc-source-chip--${sourceKey(s)}">${sourceLabel(s)}</span>`
                )}
              </div>`
            : nothing}
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
                      >Primary source: ${o.authoritativeSource.publication ||
                      o.authoritativeSource.title ||
                      o.authoritativeSource.url}</a
                    >`
                  : nothing}
                ${this._renderDrafts(o.id)}
                <div class="obs-actions">${this._renderGenerateButton(o)}</div>
              </div>
            `
          : nothing}
        <button
          type="button"
          class="obs-expand-toggle"
          aria-expanded=${open}
          aria-label=${open ? 'Show less' : 'Show details'}
          @click=${() => this._toggleExpanded(o.id)}
        >
          ${chevronIcon()}
        </button>
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
    const acted = this._observations.filter((o) => this._outcomes[o.id] === 'acted');
    const dismissed = this._observations.filter((o) => this._outcomes[o.id] === 'dismissed');
    const moreToLoad = this._observations.length < this._total;
    return html`
      ${this._renderToolbar()}
      <p class="nc-count">${rows.length} of ${this._total}</p>
      ${rows.length
        ? rows.map((o) => this._renderCard(o))
        : html`<div class="card"><p>No matching trends.</p></div>`}
      ${moreToLoad
        ? html`<button
            class="nc-load-more"
            ?disabled=${this._loadingMore}
            @click=${() => this._loadMore()}
          >
            ${this._loadingMore
              ? 'Loading…'
              : `Load more (${this._total - this._observations.length} more)`}
          </button>`
        : nothing}
      ${acted.length
        ? html`<p class="outcome-label outcome-label--acted">Acted</p>
            ${acted.map((o) => this._renderResolvedCard(o, 'acted'))}`
        : nothing}
      ${dismissed.length
        ? html`<p class="outcome-label outcome-label--dismissed">Dismissed</p>
            ${dismissed.map((o) => this._renderResolvedCard(o, 'dismissed'))}`
        : nothing}
    `;
  }

  _renderResolvedCard(o, kind) {
    const cardClass = kind === 'acted' ? 'obs-resolved--acted' : 'obs-resolved--dismissed';
    return html`
      <div class="card observation-item obs-resolved ${cardClass}">
        <div class="obs-header">
          <p class="obs-name">
            <span class="obs-mark obs-mark--${kind}">${kind === 'acted' ? checkIcon() : closeIcon()}</span>${o.title}
          </p>
          <button class="obs-undo-btn" @click=${() => this._clearOutcome(o.id)}>Undo</button>
        </div>
      </div>`;
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
