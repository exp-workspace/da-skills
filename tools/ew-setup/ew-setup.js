import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { LitElement, html, nothing } from 'da-lit';
import { parseOrgSite, hasEwEnabled, buildConfigWithEwEnabled, hasCorrectSidekickConfig, buildUpdatedSidekickConfig } from './utils.js';

class EwSetupApp extends LitElement {
  static properties = {
    _orgSiteInput: { state: true },
    _org: { state: true },
    _site: { state: true },
    _token: { state: true },
    _step: { state: true }, // 'input' | 1 | 2
    _configScope: { state: true }, // 'site' | 'org'
    _configStatus: { state: true }, // 'idle'|'loading'|'exists'|'written'|'error'
    _errorMsg: { state: true },
    _sidekickStatus: { state: true }, // 'idle'|'loading'|'exists'|'written'|'error'
    _sidekickErrorMsg: { state: true },
    _sidekickErrorSource: { state: true }, // 'read'|'write'
  };

  constructor() {
    super();
    this._orgSiteInput = '';
    this._org = '';
    this._site = '';
    this._token = null;
    this._step = 'input';
    this._configScope = 'site';
    this._configStatus = 'idle';
    this._errorMsg = null;
    this._configJson = null;
    this._configInFlight = false;
    this._sidekickStatus = 'idle';
    this._sidekickErrorMsg = null;
    this._sidekickErrorSource = null;
    this._sidekickJson = null;
  }

  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  async _init() {
    try {
      const { token } = await DA_SDK;
      this._token = token;
    } catch {
      // SDK unavailable in standalone/dev — token stays null
    }
    const parsed = parseOrgSite(window.location.hash.replace(/^#/, ''));
    if (parsed) {
      this._org = parsed.org;
      this._site = parsed.site;
      this._orgSiteInput = `/${parsed.org}/${parsed.site}`;
    }
  }

  _onContinue() {
    const parsed = parseOrgSite(this._orgSiteInput);
    if (!parsed) return;
    this._org = parsed.org;
    this._site = parsed.site;
    this._step = 1;
    this._configScope = 'site';
    this._configStatus = 'idle';
    this._errorMsg = null;
    this._configJson = null;
    this._configInFlight = false;
    this._sidekickStatus = 'idle';
    this._sidekickErrorMsg = null;
    this._sidekickErrorSource = null;
    this._sidekickJson = null;
  }

  async _onEnableEw() {
    this._configStatus = 'loading';
    await this._readConfig();
  }

  _configUrl() {
    return this._configScope === 'org'
      ? `https://admin.da.live/config/${this._org}`
      : `https://admin.da.live/config/${this._org}/${this._site}`;
  }

  async _readConfig() {
    if (this._configInFlight) return;
    this._configInFlight = true;
    this._configStatus = 'loading';
    try {
      const resp = await fetch(this._configUrl(), {
        headers: { Authorization: `Bearer ${this._token}` },
      });
      if (resp.status === 401 || resp.status === 403) {
        this._configStatus = 'error';
        this._errorMsg = 'permission';
        return;
      }
      if (!resp.ok) {
        if (resp.status === 404) {
          this._configJson = null;
          await this._writeConfig();
        } else {
          this._configStatus = 'error';
          this._errorMsg = `Unexpected server error (HTTP ${resp.status})`;
        }
        return;
      }
      const json = await resp.json();
      this._configJson = json;
      if (hasEwEnabled(json)) {
        this._configStatus = 'exists';
      } else {
        await this._writeConfig();
      }
    } catch {
      this._configStatus = 'error';
      this._errorMsg = 'network';
    } finally {
      this._configInFlight = false;
    }
  }

  async _writeConfig() {
    try {
      const updated = buildConfigWithEwEnabled(this._configJson);
      const body = new FormData();
      body.append('config', JSON.stringify(updated));
      const resp = await fetch(this._configUrl(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this._token}` },
        body,
      });
      if (resp.ok) {
        this._configStatus = 'written';
      } else if (resp.status === 401 || resp.status === 403) {
        this._configStatus = 'error';
        this._errorMsg = 'permission';
      } else {
        this._configStatus = 'error';
        this._errorMsg = `Unexpected server error (HTTP ${resp.status})`;
      }
    } catch {
      this._configStatus = 'error';
      this._errorMsg = 'network';
    }
  }

  async _onNextSidekick() {
    this._step = 2;
    this._sidekickStatus = 'loading';
    await this._readSidekickConfig();
  }

  async _readSidekickConfig() {
    try {
      const resp = await fetch(`https://admin.hlx.page/config/${this._org}/sites/${this._site}/sidekick.json`, {
        headers: { Authorization: `Bearer ${this._token}` },
      });
      if (resp.status === 401 || resp.status === 403) {
        this._sidekickStatus = 'error';
        this._sidekickErrorMsg = 'permission';
        this._sidekickErrorSource = 'read';
        return;
      }
      if (!resp.ok) {
        if (resp.status === 404) {
          this._sidekickJson = null;
          await this._writeSidekickConfig();
        } else {
          this._sidekickStatus = 'error';
          this._sidekickErrorMsg = `Unexpected server error (HTTP ${resp.status})`;
          this._sidekickErrorSource = 'read';
        }
        return;
      }
      const json = await resp.json();
      this._sidekickJson = json;
      if (hasCorrectSidekickConfig(json)) {
        this._sidekickStatus = 'exists';
      } else {
        await this._writeSidekickConfig();
      }
    } catch {
      this._sidekickStatus = 'error';
      this._sidekickErrorMsg = 'network';
      this._sidekickErrorSource = 'read';
    }
  }

  async _writeSidekickConfig() {
    try {
      const updated = buildUpdatedSidekickConfig(this._sidekickJson);
      const resp = await fetch(`https://admin.hlx.page/config/${this._org}/sites/${this._site}/sidekick.json`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updated),
      });
      if (resp.ok) {
        this._sidekickStatus = 'written';
      } else if (resp.status === 401 || resp.status === 403) {
        this._sidekickStatus = 'error';
        this._sidekickErrorMsg = 'permission';
        this._sidekickErrorSource = 'write';
      } else {
        this._sidekickStatus = 'error';
        this._sidekickErrorMsg = `Unexpected server error (HTTP ${resp.status})`;
        this._sidekickErrorSource = 'write';
      }
    } catch {
      this._sidekickStatus = 'error';
      this._sidekickErrorMsg = 'network';
      this._sidekickErrorSource = 'write';
    }
  }

  _renderCanvasLink() {
    const url = `https://da.live/#/${this._org}/${this._site}`;
    return html`
      <div class="canvas-link-block">
        <span class="canvas-link-label">Open Experience Workspace</span>
        <a class="canvas-link" href="${url}" target="_blank">${url}</a>
      </div>`;
  }

  _renderStepIndicator() {
    let s1Class = '';
    if (this._step === 1) s1Class = 'active';
    else if (this._step === 2) s1Class = 'done';
    const s2Class = this._step === 2 ? 'active' : '';
    return html`
      <div class="steps">
        <div class="step-badge ${s1Class}">1</div>
        <span class="step-label ${this._step === 1 ? 'active' : ''}">Enable Experience Workspace</span>
        <div class="step-divider"></div>
        <div class="step-badge ${s2Class}">2</div>
        <span class="step-label ${this._step === 2 ? 'active' : ''}">Configure Sidekick</span>
      </div>`;
  }

  _renderStep1() {
    const scopeLabel = this._configScope === 'org' ? `org '${this._org}'` : `${this._org}/${this._site}`;
    const configPageUrl = this._configScope === 'org'
      ? `https://da.live/config#/${this._org}/`
      : `https://da.live/config#/${this._org}/${this._site}/`;

    if (this._configStatus === 'idle') {
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <p class="scope-intro">Choose where to enable Experience Workspace:</p>
          <div class="scope-options">
            <label class="scope-option">
              <input type="radio" name="ew-scope" value="site"
                ?checked=${this._configScope === 'site'}
                @change=${() => { this._configScope = 'site'; }}>
              <div class="scope-option-text">
                <span class="scope-option-label">Site</span>
                <span class="scope-option-desc">Enable for <strong>${this._org}/${this._site}</strong> only</span>
              </div>
            </label>
            <label class="scope-option">
              <input type="radio" name="ew-scope" value="org"
                ?checked=${this._configScope === 'org'}
                @change=${() => { this._configScope = 'org'; }}>
              <div class="scope-option-text">
                <span class="scope-option-label">Org</span>
                <span class="scope-option-desc">Enable for <strong>all sites</strong> within <strong>${this._org}</strong></span>
              </div>
            </label>
          </div>
          <div class="cta-bar">
            <sl-button class="ew-fill-accent" @click=${() => this._onEnableEw()}>
              Enable Experience Workspace
            </sl-button>
          </div>
        </div>`;
    }

    if (this._configStatus === 'loading') {
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <div style="display:flex;gap:12px;align-items:center;padding:16px 0">
            <div class="spinner"></div>
            <span>Updating ${this._configScope} config…</span>
          </div>
        </div>`;
    }

    if (this._configStatus === 'exists') {
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <p class="success-msg">✅ Already enabled for ${scopeLabel}</p>
          ${this._renderCanvasLink()}
          <div class="cta-bar">
            <sl-button class="ew-fill-accent" @click=${() => this._onNextSidekick()}>
              Next: Configure Sidekick
            </sl-button>
          </div>
        </div>`;
    }

    if (this._configStatus === 'written') {
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <p class="success-msg">✅ Experience Workspace is now enabled for ${scopeLabel}</p>
          ${this._renderCanvasLink()}
          <div class="cta-bar">
            <sl-button class="ew-fill-accent" @click=${() => this._onNextSidekick()}>
              Next: Configure Sidekick
            </sl-button>
          </div>
        </div>`;
    }

    if (this._configStatus === 'error' && this._errorMsg === 'permission') {
      const adminKind = this._configScope === 'org' ? 'org' : 'site';
      const manualInstructions = 'Sheet: flags\nKey:   ew.enabled\nValue: true';
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <p class="error-msg">
            ❌ You don't have permission to update the ${adminKind} config for '${scopeLabel}'.<br>
            Please ask your DA ${adminKind} admin to add the following entry in the
            <a href="${configPageUrl}" target="_blank" style="color:var(--ew-accent)">flags config sheet</a> manually:
          </p>
          <div class="config-snippet">${manualInstructions}</div>
          <sl-button class="ew-quiet-secondary" @click=${() => navigator.clipboard?.writeText(manualInstructions)}>
            Copy
          </sl-button>
        </div>`;
    }

    if (this._configStatus === 'error') {
      return html`
        <div class="card">
          <p class="card-title">Step 1 — Enable Experience Workspace</p>
          <p class="error-msg">❌ ${this._errorMsg === 'network' ? 'Network error — check your connection and try again.' : this._errorMsg}</p>
          <div class="cta-bar">
            <sl-button class="ew-quiet-secondary" @click=${() => this._readConfig()}>Retry</sl-button>
          </div>
        </div>`;
    }

    return nothing;
  }

  _renderStep2() {
    const editUrlPattern = 'https://da.live/canvas#/{{org}}/{{site}}{{pathname}}';

    if (this._sidekickStatus === 'loading') {
      return html`
        <div class="card">
          <p class="card-title">Step 2 — Configure Sidekick</p>
          <div style="display:flex;gap:12px;align-items:center;padding:16px 0">
            <div class="spinner"></div><span>Reading sidekick config…</span>
          </div>
        </div>`;
    }

    if (this._sidekickStatus === 'exists') {
      return html`
        <div class="card">
          <p class="card-title">Step 2 — Configure Sidekick</p>
          <p class="success-msg">✅ Sidekick already configured</p>
          <div class="config-snippet">${editUrlPattern}</div>
          ${this._renderCanvasLink()}
        </div>`;
    }

    if (this._sidekickStatus === 'written') {
      return html`
        <div class="card">
          <p class="card-title">Step 2 — Configure Sidekick</p>
          <p class="success-msg">✅ Sidekick configured for ${this._org}/${this._site}</p>
          <div class="config-snippet">${editUrlPattern}</div>
          ${this._renderCanvasLink()}
        </div>`;
    }

    if (this._sidekickStatus === 'error' && this._sidekickErrorMsg === 'permission') {
      const snippet = `"editUrlPattern": "${editUrlPattern}"`;
      return html`
        <div class="card">
          <p class="card-title">Step 2 — Configure Sidekick</p>
          <p class="error-msg">
            ❌ You don't have permission to update the sidekick config for '${this._org}/${this._site}'.<br>
            Please ask a project admin to add the following entry to the sidekick config manually.
            See the <a href="https://www.aem.live/developer/sidekick-development#custom-edit-urls" target="_blank" style="color:var(--s2-red-900)">sidekick configuration docs</a> for details.
          </p>
          <div class="config-snippet">${snippet}</div>
          <sl-button class="ew-quiet-secondary" @click=${() => navigator.clipboard?.writeText(snippet)}>
            Copy
          </sl-button>
        </div>`;
    }

    if (this._sidekickStatus === 'error') {
      const msg = this._sidekickErrorMsg === 'network' ? 'Network error — check your connection and try again.' : this._sidekickErrorMsg;
      return html`
        <div class="card">
          <p class="card-title">Step 2 — Configure Sidekick</p>
          <p class="error-msg">❌ ${msg}</p>
          ${this._sidekickErrorSource === 'write' ? html`
            <a class="remediation-link" href="https://www.aem.live/developer/sidekick-development#custom-edit-urls" target="_blank">
              View sidekick configuration docs →
            </a>` : html`
            <div class="cta-bar">
              <sl-button class="ew-quiet-secondary" @click=${() => this._readSidekickConfig()}>Retry</sl-button>
            </div>`}
        </div>`;
    }

    return nothing;
  }

  render() {
    const canContinue = !!parseOrgSite(this._orgSiteInput);
    return html`
      <p class="app-title">Enable Experience Workspace</p>
      <p class="app-intro">
        This app helps you enable your current project for Experience Workspace in two simple steps.
        It is meant to be run once per project, but can also be used as a checker to verify that
        your project is ready for Experience Workspace.<br>
        Note: enabling a project requires the current user to have permissions to modify the DA config
        and EDS config admin permissions to update the sidekick configuration.
      </p>

      <div class="org-site-row">
        <div class="org-site-field">
          <label class="org-site-label">Org / Site</label>
          <sl-input
            type="text"
            placeholder="/org/site"
            .value=${this._orgSiteInput}
            @input=${(e) => { this._orgSiteInput = e.target.value; }}
          ></sl-input>
        </div>
        <sl-button class="ew-fill-accent org-site-submit" ?disabled=${!canContinue} @click=${() => this._onContinue()}>
          Get Started
        </sl-button>
      </div>

      ${this._step !== 'input' ? this._renderStepIndicator() : nothing}
      ${this._step === 1 ? this._renderStep1() : nothing}
      ${this._step === 2 ? this._renderStep2() : nothing}
    `;
  }
}

customElements.define('ew-setup-app', EwSetupApp);
