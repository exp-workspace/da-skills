import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from './utils/utils.js';
import { toSafeId } from './utils/sheet-utils.js';
import './shared/tabs/tabs.js';
import './shared/card/card.js';
import './shared/popover/popover.js';
import {
  fetchDaConfigSheets,
  loadSkillsFromAo,
  fetchSkillFileFromAo,
  uploadSkillFileToAo,
  removePersonalSkillSource,
  AO_SCOPE_PERSONAL,
  upsertSkillInConfig,
  deleteSkillFromConfig,
  writeSkillMdFile,
  readSkillMdFile,
  deleteSkillMdFile,
  upsertPromptInConfig,
  deletePromptFromConfig,
  loadAgentPresets,
  saveAgentPresetFile,
  deleteAgentPresetFile,
  fetchMcpToolsFromAgent,
  extractToolRefs,
  consumeSuggestionHandoff,
  clearSuggestionSession,
  registerMcpServer,
  setMcpServerEnabled,
  deleteMcpServer,
  setToolOverride,
  deleteToolOverride,
  skillRowStatus,
  skillRowEnabled,
  rowHeadersToArray,
  fetchSiteSourceText,
  DA_SKILLS_EDITOR_SUGGESTION_HANDOFF,
  DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_LAB_SUGGESTION_HANDOFF,
  DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT,
  fetchSkillsPermission,
} from './skills-editor-api.js';
import {
  BUILTIN_AGENTS,
  BUILTIN_TOOL_IDS,
  FRESH_FORM_STATE,
  STATUS,
  STATUS_TYPE,
} from './constants.js';
import {
  renderTopNav,
  renderChatDrawer,
  renderListCol,
} from './renderers.js';
import { ensureSkillFrontmatter } from './utils/skill-frontmatter.js';
import {
  createReadOnlyViewer, createEditor, replaceDoc, destroyEditor,
} from './utils/codemirror-loader.js';
import {
  onMessage,
  sendMessage,
  consumeSuggestionFromStorage,
  onStorageSuggestion,
} from './utils/skills-channel.js';

const [styles, catalogStyles, editorStyles, toolsStyles] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./catalog.css', import.meta.url).href),
  loadStyle(new URL('./editor-panel.css', import.meta.url).href),
  loadStyle(new URL('./tools.css', import.meta.url).href),
]);

class NxSkillsEditor extends LitElement {
  static properties = {
    _isLoading: { state: true },
    _refreshingCount: { state: true },
    _catalogTab: { state: true },
    _catalogFilter: { state: true },
    _skills: { state: true },
    _skillStatuses: { state: true },
    _skillScopes: { state: true },
    _skillDescriptions: { state: true },
    _skillDisplayNames: { state: true },
    _skillLineCounts: { state: true },
    _prompts: { state: true },
    _agents: { state: true },
    _agentRows: { state: true },
    _mcpRows: { state: true },
    _mcpTools: { state: true },
    _configuredMcpServers: { state: true },
    _configuredMcpServerHeaders: { state: true },
    _formSkillId: { state: true },
    _formSkillBody: { state: true },
    _isFormEdit: { state: true },
    _formPromptTitle: { state: true },
    _formPromptCategory: { state: true },
    _formPromptBody: { state: true },
    _formPromptIcon: { state: true },
    _formPromptOriginalTitle: { state: true },
    _isFormPromptEdit: { state: true },
    _isSaveBusy: { state: true },
    _statusMsg: { state: true },
    _statusType: { state: true },
    _hasSuggestion: { state: true },
    _mcpKey: { state: true },
    _mcpUrl: { state: true },
    _mcpDescription: { state: true },
    _mcpHeaders: { state: true },
    _editingMcpKey: { state: true },
    _viewingSkillId: { state: true },
    _skillMdModalOpen: { state: true },
    _selectedAgentId: { state: true },
    _viewingMcpServerId: { state: true },
    _mcpEnableBusy: { state: true },
    _activeToolRefs: { state: true },
    _toolOverrides: { state: true },
    _memory: { state: true },
    _isEditorOpen: { state: true },
    _isAgentViewTools: { state: true },
    _isFormDirty: { state: true },
    _promptSearch: { state: true },
    _toolsSearch: { state: true },
    _toolsGroupCollapsed: { state: true },
    _showDepTree: { state: true },
    _catalogViewMode: { state: true },
    _agentFilter: { state: true },
    _formPromptTools: { state: true },
    _newAgentId: { state: true },
    _newAgentName: { state: true },
    _isChatOpen: { state: true },
    _gateOrg: { state: true },
    _gateSite: { state: true },
    _canWrite: { state: true },
    _confirmDialog: { state: true },
    chatImportUrl: { type: String, attribute: 'chat-import-url' },
    chatAgentId: { type: String, attribute: 'chat-agent-id' },
  };

  // ─── non-reactive instance fields (simple inits, not LitElement state) ────
  _loadedKey = null;

  _canWriteKey = null;

  _statusTimer = null;

  _dirtyForms = {}; // non-reactive: { [tabId]: snapshot }

  _editorTriggerSelector = null; // CSS selector for the element that opened the drawer

  _chatLoaded = false;

  _agentsLoadInFlight = false;

  _mcpToolsLoadInFlight = false;

  /** Count of in-flight operations that want the refresh indicator shown. */
  _refreshingCount = 0;

  _resolveConfirm = null;

  // ─── stable event-handler references (class fields so connect/disconnect are symmetric) ────
  _onSuggestionHandler = () => this._applySuggestion();

  _onClearFormHandler = () => this._clearForm();

  _onSkillsChangedHandler = () => this._loadSkills({ silent: true, showRefreshIndicator: true });

  _onPopstateHandler = (e) => this._onPopstate(e);

  constructor() {
    super();
    this._hash = new HashController(this);
    this._isLoading = true;
    this._refreshingCount = 0;
    this._catalogTab = 'skills';
    this._catalogFilter = 'all';
    this._skills = {};
    this._skillStatuses = {};
    this._skillScopes = {};
    this._skillDescriptions = {};
    this._skillDisplayNames = {};
    this._skillLineCounts = {};
    this._prompts = [];
    this._agents = [];
    this._agentRows = [];
    this._mcpRows = [];
    this._mcpTools = null;
    this._configuredMcpServers = {};
    this._configuredMcpServerHeaders = {};
    this._clearForm();
    this._gateOrg = '';
    this._gateSite = '';
    this._canWrite = true;
    this._mcpEnableBusy = {};
    this._viewingSkillId = null;
    this._skillMdModalOpen = false;
    this._selectedAgentId = null;
    this._activeToolRefs = null;
    this._toolOverrides = {};
    this._memory = null;
    this._isEditorOpen = false;
    this._isAgentViewTools = false;
    this._isFormDirty = false;
    this._promptSearch = '';
    this._toolsSearch = '';
    this._toolsGroupCollapsed = { DA: false, MCP: false };
    this._showDepTree = false;
    this._catalogViewMode = 'grid';
    this._agentFilter = 'all';
    this._formPromptTools = [];
    this._isChatOpen = false;
  }

  get _org() { return this._hash.value?.org; }

  get _site() { return this._hash.value?.site; }

  /**
   * Promise-based replacement for window.confirm().
   * @param {string} itemType - e.g. "skill", "prompt", "MCP server"
   * @param {string} itemId   - the identifier shown to the user
   * @returns {Promise<boolean>}
   */
  _confirm(itemType, itemId) {
    return new Promise((resolve) => {
      this._resolveConfirm = resolve;
      this._confirmDialog = { itemType, itemId };
    });
  }

  _closeConfirm(accepted) {
    this._resolveConfirm?.(accepted);
    this._resolveConfirm = null;
    this._confirmDialog = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles, catalogStyles, editorStyles, toolsStyles];
    this._isChatOpen = this.chatImportUrl
      ? sessionStorage.getItem('nx-skills-editor-chat-open') === '1'
      : false;
    if (this._isChatOpen && this.chatImportUrl) {
      import(this.chatImportUrl).then(() => { this._chatLoaded = true; });
    }

    // BroadcastChannel listeners (future da-nx + cross-tab)
    this._unsubBC = [
      onMessage('suggestion-handoff', (payload) => this._onSuggestionFromChannel(payload)),
      onMessage('clear-form', () => this._onClearFormHandler()),
    ];

    // Legacy: window events for same-document compat (testing, fallback)
    window.addEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.addEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.addEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.addEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.addEventListener('da-skills-changed', this._onSkillsChangedHandler);

    // Cross-tab: listen for storage events (legacy chat writes to sessionStorage)
    this._unsubStorage = onStorageSuggestion((data) => this._onSuggestionFromChannel(data));

    // Check sessionStorage for a suggestion left before we loaded
    const pending = consumeSuggestionFromStorage();
    if (pending) this._onSuggestionFromChannel(pending);

    window.addEventListener('popstate', this._onPopstateHandler);
    history.replaceState({ ...history.state, skillsEditorTab: this._catalogTab }, '');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._statusTimer);
    this._unsubBC?.forEach((unsub) => unsub());
    this._unsubStorage?.();
    window.removeEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.removeEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.removeEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.removeEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.removeEventListener('da-skills-changed', this._onSkillsChangedHandler);
    window.removeEventListener('popstate', this._onPopstateHandler);
    this._disposeCMModal();
    this._disposeMemoryCM();
    this._disposeSkillCM();
  }

  async updated(changed) {
    if (!this._org || !this._site) return;
    const key = `${this._org}/${this._site}`;
    if (key !== this._loadedKey) {
      this._loadedKey = key;
      this._memory = null;
      const restored = this._restoreDataSnapshot();
      if (restored) {
        this._isLoading = false;
        await this._reload({
          silent: true,
          showRefreshIndicator: true,
        });
      } else {
        await this._reload();
      }
      // Restore panel state after data is available (must come after _reload)
      await this._restoreNavState();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'memory' && this._memory === null) {
      this._loadMemory();
    }
    if (changed?.has('_catalogTab') && this._catalogTab !== 'memory') {
      this._disposeMemoryCM();
    }
    if ((changed?.has('_memory') || changed?.has('_catalogTab')) && this._catalogTab === 'memory' && this._memory) {
      this.updateComplete.then(() => this._mountMemoryCM());
    }
    // ── Skill body CM: mount when skill form appears, dispose when it hides ──
    const skillFormVisible = this._isEditorOpen && this._catalogTab === 'skills'
      && !(this._viewingSkillId && !this._isFormEdit);
    if (changed?.has('_catalogTab') && this._catalogTab !== 'skills') {
      this._disposeSkillCM();
    }
    if (changed?.has('_isEditorOpen') && !this._isEditorOpen) {
      this._disposeSkillCM();
    }
    if (skillFormVisible && !this._skillCM
      && (changed?.has('_isEditorOpen') || changed?.has('_catalogTab')
        || changed?.has('_isFormEdit') || changed?.has('_viewingSkillId'))) {
      this.updateComplete.then(() => this._mountSkillCM());
    }
    if (changed?.has('_formSkillBody') && this._skillCM && !this._isSkillCMUpdating) {
      replaceDoc(this._skillCM, this._formSkillBody || '');
    }
    this._isSkillCMUpdating = false;

    if (changed?.has('_catalogTab') && this._catalogTab === 'agents') {
      this._ensureAgentsLoaded();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'mcps') {
      this._ensureMcpToolsLoaded();
    }
    // Move focus into the detail view on open; restore it to the trigger on close.
    if (changed?.has('_isEditorOpen')) {
      if (this._isEditorOpen) {
        this.updateComplete.then(() => {
          const firstFocusable = this.shadowRoot.querySelector(
            '.detail-view input:not([disabled]), .detail-view textarea:not([disabled]), .detail-view .cm-content, .detail-view button:not([disabled])',
          );
          firstFocusable?.focus();
        });
      } else if (this._editorTriggerSelector) {
        this.updateComplete.then(() => {
          const trigger = this.shadowRoot.querySelector(this._editorTriggerSelector);
          trigger?.focus();
          this._editorTriggerSelector = null;
        });
      }
    }
    // Persist navigation state when structural nav properties change.
    // We skip this during the initial load cycle (before _loadedKey is set) to
    // avoid overwriting a saved state with the blank initial state.
    if (changed && this._loadedKey) {
      const itemChanged = (changed.has('_formSkillId') && this._isFormEdit)
        || (changed.has('_formPromptTitle') && this._isFormPromptEdit)
        || changed.has('_editingMcpKey');
      if (changed.has('_isEditorOpen') || changed.has('_catalogTab') || itemChanged) {
        this._saveNavState();
      }
    }
  }

  // ─── nav state persistence ────────────────────────────────────────────────

  _navStorageKey() {
    return `da-skills-editor-nav:${this._org}/${this._site}`;
  }

  _dataSnapshotStorageKey() {
    return `da-skills-editor-data:${this._org}/${this._site}`;
  }

  _saveDataSnapshot() {
    if (!this._org || !this._site) return;
    const snapshot = {
      skills: this._skills,
      skillStatuses: this._skillStatuses,
      skillScopes: this._skillScopes,
      skillDescriptions: this._skillDescriptions,
      skillDisplayNames: this._skillDisplayNames,
      skillLineCounts: this._skillLineCounts,
      prompts: this._prompts,
      agentRows: this._agentRows,
      mcpRows: this._mcpRows,
      configuredMcpServers: this._configuredMcpServers,
      configuredMcpServerHeaders: this._configuredMcpServerHeaders,
      toolOverrides: this._toolOverrides,
      agents: this._agents,
    };
    try {
      sessionStorage.setItem(this._dataSnapshotStorageKey(), JSON.stringify(snapshot));
    } catch { /* best effort */ }
  }

  _restoreDataSnapshot() {
    if (!this._org || !this._site) return false;
    try {
      const raw = sessionStorage.getItem(this._dataSnapshotStorageKey());
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return false;
      this._skills = snap.skills || {};
      this._skillStatuses = snap.skillStatuses || {};
      this._skillScopes = snap.skillScopes || {};
      this._skillDescriptions = snap.skillDescriptions || {};
      this._skillDisplayNames = snap.skillDisplayNames || {};
      this._skillLineCounts = snap.skillLineCounts || {};
      this._prompts = Array.isArray(snap.prompts) ? snap.prompts : [];
      this._agentRows = Array.isArray(snap.agentRows) ? snap.agentRows : [];
      this._mcpRows = Array.isArray(snap.mcpRows) ? snap.mcpRows : [];
      this._configuredMcpServers = snap.configuredMcpServers || {};
      this._configuredMcpServerHeaders = snap.configuredMcpServerHeaders || {};
      this._toolOverrides = snap.toolOverrides || {};
      this._agents = Array.isArray(snap.agents) ? snap.agents : [];
      return true;
    } catch {
      return false;
    }
  }

  _saveNavState() {
    if (!this._org || !this._site) return;
    const tab = this._catalogTab;
    const payload = { tab, editorOpen: this._isEditorOpen };

    if (this._isEditorOpen) {
      if ((tab === 'skills' || tab === 'agents') && this._viewingSkillId && !this._isFormEdit) {
        payload.itemType = 'skill-view';
        payload.itemId = this._viewingSkillId;
      } else if ((tab === 'skills' || tab === 'agents') && this._isFormEdit && this._formSkillId) {
        payload.itemType = 'skill';
        payload.itemId = this._formSkillId;
      } else if (tab === 'prompts' && this._isFormPromptEdit && this._formPromptTitle) {
        payload.itemType = 'prompt';
        payload.itemId = this._formPromptTitle;
      } else if (tab === 'mcps' && this._editingMcpKey) {
        payload.itemType = 'mcp';
        payload.itemId = this._editingMcpKey;
      }
    }

    try {
      sessionStorage.setItem(this._navStorageKey(), JSON.stringify(payload));
    } catch { /* quota / private browsing */ }
  }

  async _restoreNavState() {
    if (!this._org || !this._site) return;
    let payload;
    try {
      const raw = sessionStorage.getItem(this._navStorageKey());
      if (!raw) return;
      payload = JSON.parse(raw);
    } catch { return; }

    const { tab, editorOpen, itemType, itemId } = payload;

    if (tab) this._catalogTab = tab;

    if (!editorOpen) return;

    if (tab === 'memory') {
      this._isEditorOpen = true;
      return;
    }

    if (!itemId) {
      this._isEditorOpen = true;
      return;
    }

    if (itemType === 'skill-view') {
      this._onViewSkill(itemId);
    } else if (itemType === 'skill') {
      await this._onEditSkill(itemId);
    } else if (itemType === 'prompt') {
      const row = (this._prompts || []).find((p) => p.title === itemId);
      if (row) this._openEditor(row);
    } else if (itemType === 'mcp') {
      const row = (this._mcpRows || []).find((r) => r.key === itemId);
      if (row) this._onEditMcp(row);
      else { this._editingMcpKey = itemId; this._isEditorOpen = true; }
    }
  }

  // ─── data loading ─────────────────────────────────────────────────────────

  async _reload(options = {}) {
    if (!this._org || !this._site) return;
    const {
      silent = false,
      showRefreshIndicator = false,
    } = options;
    if (!silent) this._isLoading = true;
    if (showRefreshIndicator) this._refreshingCount += 1;

    try {
      const configResult = await fetchDaConfigSheets(this._org, this._site);
      const permKey = `${this._org}/${this._site}`;
      const [skillsResult, hasWritePermission] = await Promise.all([
        loadSkillsFromAo(this._org, this._site, configResult),
        this._canWriteKey === permKey
          ? Promise.resolve(this._canWrite)
          : fetchSkillsPermission(this._org, this._site),
      ]);

      if (this._canWriteKey !== permKey) {
        this._canWriteKey = permKey;
        this._canWrite = hasWritePermission;
      }
      this._skills = skillsResult.map;
      this._skillStatuses = skillsResult.statuses;
      this._skillScopes = skillsResult.scopes || {};
      this._skillDescriptions = skillsResult.descriptions || {};
      this._skillDisplayNames = skillsResult.displayNames || {};
      this._skillLineCounts = skillsResult.lineCounts || {};
      this._prompts = configResult.json?.prompts?.data || [];
      this._agentRows = configResult.agentRows || [];
      this._mcpRows = configResult.mcpRows || [];
      this._configuredMcpServers = configResult.configuredMcpServers || {};
      this._configuredMcpServerHeaders = configResult.configuredMcpServerHeaders || {};
      this._toolOverrides = configResult.toolOverrides || {};
      this._saveDataSnapshot();

      this._applySuggestion();
    } finally {
      if (!silent) this._isLoading = false;
      if (showRefreshIndicator) this._refreshingCount = Math.max(0, this._refreshingCount - 1);
    }
  }

  async _ensureAgentsLoaded() {
    if (this._agentsLoadInFlight || this._agents.length) return;
    const loadKey = this._loadedKey;
    this._agentsLoadInFlight = true;
    this._refreshingCount += 1;
    try {
      const presets = await loadAgentPresets(this._org, this._site);
      if (`${this._org}/${this._site}` === loadKey) {
        this._agents = presets;
        this._saveDataSnapshot();
      }
    } catch {
      // non-fatal: agent presets unavailable
    } finally {
      this._agentsLoadInFlight = false;
      this._refreshingCount = Math.max(0, this._refreshingCount - 1);
    }
  }

  async _ensureMcpToolsLoaded() {
    if (
      this._mcpToolsLoadInFlight
      || this._mcpTools
      || !Object.keys(this._configuredMcpServers).length
    ) return;
    const loadKey = this._loadedKey;
    this._mcpToolsLoadInFlight = true;
    this._refreshingCount += 1;
    try {
      const tools = await fetchMcpToolsFromAgent(
        this._configuredMcpServers,
        this._configuredMcpServerHeaders,
      );
      if (`${this._org}/${this._site}` === loadKey) this._mcpTools = tools;
    } catch {
      // non-fatal: MCP tool listing unavailable
    } finally {
      this._mcpToolsLoadInFlight = false;
      this._refreshingCount = Math.max(0, this._refreshingCount - 1);
    }
  }

  _applySuggestion() {
    const suggestion = consumeSuggestionHandoff();
    if (suggestion) this._onSuggestionFromChannel(suggestion);
  }

  _onSuggestionFromChannel(suggestion) {
    if (!suggestion) return;
    this._formSkillId = suggestion.id || '';
    this._formSkillBody = suggestion.body || '';
    this._isFormEdit = false;
    this._hasSuggestion = true;
    this._catalogTab = 'skills';
    this._isEditorOpen = true;
  }

  // ─── form helpers ─────────────────────────────────────────────────────────

  _clearForm() {
    Object.entries(FRESH_FORM_STATE).forEach(([key, val]) => {
      const prop = `_${key}`;
      this[prop] = Array.isArray(val)
        ? val.map((v) => (v && typeof v === 'object' ? { ...v } : v))
        : val;
    });
    this._isSaveBusy = false;
    this._statusMsg = '';
    this._statusType = '';
    this._hasSuggestion = false;
    this._viewingSkillId = null;
    this._skillMdModalOpen = false;
    this._selectedAgentId = null;
  }

  _dismissForm() {
    this._clearDirty();
    this._clearForm();
    this._isEditorOpen = false;
    sendMessage('form-dismiss');
  }

  _closeEditor() {
    if (this._isFormEdit && this._viewingSkillId) {
      this._isFormEdit = false;
      this._isFormDirty = false;
      return;
    }
    this._isEditorOpen = false;
    if (!this._isFormDirty) this._clearForm();
  }

  async _toggleChat() {
    this._isChatOpen = !this._isChatOpen;
    sessionStorage.setItem('nx-skills-editor-chat-open', this._isChatOpen ? '1' : '0');
    if (this._isChatOpen && !this._chatLoaded && this.chatImportUrl) {
      await import(this.chatImportUrl);
      this._chatLoaded = true;
    }
  }

  _setStatus(msg, type = STATUS_TYPE.OK) {
    clearTimeout(this._statusTimer);
    this._statusMsg = msg;
    this._statusType = type;
    if (type === 'ok') {
      this._statusTimer = setTimeout(() => { this._statusMsg = ''; }, 3000);
    }
  }

  // ─── dirty form tracking ─────────────────────────────────────────────────

  /** Snapshot current in-flight form fields, keyed by the active tab. */
  _captureForm() {
    const snap = { tab: this._catalogTab };
    Object.keys(FRESH_FORM_STATE).forEach((key) => {
      const val = this[`_${key}`];
      snap[key] = Array.isArray(val)
        ? val.map((v) => (v && typeof v === 'object' ? { ...v } : v))
        : val;
    });
    return snap;
  }

  /** Restore form fields from a previously captured snapshot. */
  _restoreForm(snapshot) {
    if (!snapshot) return;
    Object.keys(FRESH_FORM_STATE).forEach((key) => {
      if (key in snapshot) {
        const val = snapshot[key];
        this[`_${key}`] = Array.isArray(val)
          ? val.map((v) => (v && typeof v === 'object' ? { ...v } : v))
          : val;
      }
    });
    this._isEditorOpen = true;
  }

  /** Called on every form keystroke — marks the form as edited and keeps snapshot current. */
  _markDirty() {
    this._isFormDirty = true;
    this._dirtyForms[this._catalogTab] = this._captureForm();
  }

  /** Called after a successful save or explicit discard — removes stored draft. */
  _clearDirty() {
    this._isFormDirty = false;
    delete this._dirtyForms[this._catalogTab];
  }

  // ─── tab navigation with state preservation ──────────────────────────────

  _onTabChange(newTab) {
    if (newTab === this._catalogTab) return;

    // If the form wasn't touched, don't preserve it (clean switch).
    // If it was dirty, the snapshot is already up-to-date in _dirtyForms.
    if (!this._isFormDirty) delete this._dirtyForms[this._catalogTab];

    this._isFormDirty = false;
    this._statusMsg = '';
    this._catalogTab = newTab;
    this._promptSearch = '';
    this._catalogFilter = 'all'; // filter is tab-local; reset on every switch

    const saved = this._dirtyForms[newTab];
    if (saved) {
      this._restoreForm(saved);
      this._isFormDirty = true;
    } else {
      this._clearForm();
      this._isEditorOpen = newTab === 'memory';
    }

    this._pushTabState(newTab);
  }

  _pushTabState(tab) {
    // Merge with existing page state so we don't blow away the app's own history data.
    history.pushState({ ...history.state, skillsEditorTab: tab }, '');
  }

  _onPopstate(e) {
    const { skillsEditorTab } = e.state || {};
    if (!skillsEditorTab) return;

    // Snapshot current dirty edits before leaving
    if (this._isFormDirty) this._dirtyForms[this._catalogTab] = this._captureForm();

    this._isFormDirty = false;
    this._statusMsg = '';
    this._catalogTab = skillsEditorTab;
    this._promptSearch = '';
    this._catalogFilter = 'all'; // filter is tab-local; reset on back/forward

    const saved = this._dirtyForms[skillsEditorTab];
    if (saved) {
      this._restoreForm(saved);
      this._isFormDirty = true;
    } else {
      this._clearForm();
      this._isEditorOpen = skillsEditorTab === 'memory';
    }
  }

  /** Derive a stable CSS selector for the active trigger element. */
  _captureTriggerSelector() {
    const el = this.shadowRoot.activeElement;
    if (!el) return null;
    if (el.dataset?.skillId) return `[data-skill-id="${el.dataset.skillId}"]`;
    if (el.dataset?.mcpKey) return `[data-mcp-key="${el.dataset.mcpKey}"]`;
    if (el.dataset?.promptTitle) return `[data-prompt-title="${el.dataset.promptTitle}"]`;
    if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
    if (el.classList?.contains('new-btn')) return '.new-btn';
    return null;
  }

  // ─── editor open helpers ──────────────────────────────────────────────────

  _openEditor(row) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    // If this exact prompt already has dirty edits in memory, restore them.
    const saved = this._dirtyForms.prompts;
    if (saved?.formPromptTitle === (row.title || '')) {
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._formPromptTitle = row.title || '';
    this._formPromptBody = row.prompt || '';
    this._formPromptCategory = row.category || '';
    this._formPromptIcon = row.icon || '';
    this._formPromptOriginalTitle = row.title || '';
    this._formPromptTools = extractToolRefs(row.prompt || '');
    this._isFormPromptEdit = true;
    this._statusMsg = '';
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms.prompts;
    this._catalogTab = 'prompts';
  }

  _openNewEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearForm();
    this._catalogTab = 'prompts';
    this._isEditorOpen = true;
  }

  _onPickSkillFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,text/markdown';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) this._onSkillFileSelected(file);
    }, { once: true });
    input.click();
  }

  async _onSkillFileSelected(file) {
    this._isSaveBusy = true;
    const result = await uploadSkillFileToAo(file);
    this._isSaveBusy = false;

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to upload skill', STATUS_TYPE.ERR);
      return;
    }
    this._setStatus('Skill uploaded');
    await this._reload();
  }

  _openNewMcpEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearMcpForm();
    this._editingMcpKey = null;
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
  }

  _customAgentMcpServers(agent) {
    if (Array.isArray(agent?.mcpServers)) return agent.mcpServers;
    if (Array.isArray(agent?.preset?.mcpServers)) return agent.preset.mcpServers;
    return [];
  }

  _agentToolIds(agent, isBuiltin = false) {
    const ids = new Set(BUILTIN_TOOL_IDS);
    const mcpServers = isBuiltin ? (agent?.mcpServers || []) : this._customAgentMcpServers(agent);
    const servers = this._mcpTools?.servers || [];
    servers.forEach((server) => {
      if (!mcpServers.includes(server.id) || !server.tools) return;
      server.tools.forEach((tool) => ids.add(`mcp__${server.id}__${tool.name}`));
    });
    return [...ids];
  }

  // ─── skill CRUD ───────────────────────────────────────────────────────────

  async _onSaveSkill(status = STATUS.APPROVED) {
    const rawId = this._formSkillId.trim();
    if (!rawId) {
      this._setStatus('Skill ID is required', STATUS_TYPE.ERR);
      return;
    }
    const id = this._isFormEdit ? rawId : toSafeId(rawId);
    if (!id) {
      this._setStatus('Skill ID must contain at least one alphanumeric character', STATUS_TYPE.ERR);
      return;
    }
    if (!this._isFormEdit && id !== rawId) {
      this._formSkillId = id;
    }
    let body = this._formSkillBody;
    if (!body.trim()) {
      this._setStatus('Skill body is required', STATUS_TYPE.ERR);
      return;
    }

    // Duplicate ID guard — only applies when creating a new skill, not editing.
    if (!this._isFormEdit && this._skills && id in this._skills) {
      this._setStatus(`A skill with ID "${id}" already exists. Edit it from the list.`, STATUS_TYPE.ERR);
      return;
    }

    // Frontmatter — inject if missing, then validate against Anthropic's requirements.
    const { markdown: withFm, injected, warnings } = ensureSkillFrontmatter(body, id, status);
    body = withFm;
    if (injected) {
      this._formSkillBody = body;
      this._setStatus(
        'Frontmatter added — fill in description to help the agent discover this skill.',
        STATUS_TYPE.WARN,
      );
    } else if (warnings.length) {
      this._setStatus(warnings[0], STATUS_TYPE.WARN);
    }

    this._isSaveBusy = true;
    this._statusMsg = '';

    // Write the .md file first — if it fails we don't touch the config sheet.
    const fileResult = await writeSkillMdFile(this._org, this._site, id, body);
    if (!fileResult.ok) {
      this._setStatus('Failed to write skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await upsertSkillInConfig(this._org, this._site, id, body, { status });
    if (!configResult.ok) {
      // Rollback: the .md file was written but config failed — delete the orphan
      // for new skills. Edits are safe to leave (file overwrote an existing body).
      if (!this._isFormEdit) {
        deleteSkillMdFile(this._org, this._site, id).catch(() => {});
      }
      this._setStatus(configResult.error || 'Failed to save skill config', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    this._setStatus(status === STATUS.DRAFT ? 'Saved as draft' : 'Saved');
    this._clearDirty();
    this._isSaveBusy = false;
    this._hasSuggestion = false;
    clearSuggestionSession();

    this._viewingSkillId = null;
    this._clearForm();
    this._isEditorOpen = false;
    await this._reload();
  }

  async _onChangeSkillStatus(skillId, newStatus) {
    if (!skillId) return;
    this._isSaveBusy = true;

    const body = this._skills[skillId] || '';
    if (!body.trim()) {
      this._setStatus('Skill body is empty', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const { markdown: withFm } = ensureSkillFrontmatter(body, skillId, newStatus);
    const fileResult = await writeSkillMdFile(this._org, this._site, skillId, withFm);
    if (!fileResult.ok) {
      this._setStatus('Failed to write skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await upsertSkillInConfig(this._org, this._site, skillId, withFm, { status: newStatus });
    if (!configResult.ok) {
      this._setStatus(configResult.error || 'Failed to update skill config', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    this._setStatus(newStatus === STATUS.DRAFT ? 'Moved to draft' : 'Approved');
    this._isSaveBusy = false;
    await this._reload();
  }

  async _onDeleteSkill() {
    const id = this._formSkillId.trim();
    if (!id) return;
    if (!await this._confirm('skill', id)) return;
    this._isSaveBusy = true;

    // Read existing content before deleting, so we can rollback if needed.
    const { text: rollbackBody } = await readSkillMdFile(this._org, this._site, id);

    const fileResult = await deleteSkillMdFile(this._org, this._site, id);
    if (!fileResult.ok) {
      this._setStatus('Failed to delete skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await deleteSkillFromConfig(this._org, this._site, id);
    this._isSaveBusy = false;

    if (!configResult.ok) {
      // Rollback: re-create the .md file we just deleted
      if (rollbackBody) {
        writeSkillMdFile(this._org, this._site, id, rollbackBody).catch(() => {});
      }
      this._setStatus(configResult.error || 'Failed to delete skill from config', STATUS_TYPE.ERR);
      return;
    }

    this._viewingSkillId = null;
    this._clearForm();
    this._isEditorOpen = false;
    await this._reload();
  }

  async _onDeleteSkillById(id) {
    if (this._skillScopes[id] !== AO_SCOPE_PERSONAL) return;
    if (!await this._confirm('skill', id)) return;
    this._isSaveBusy = true;

    const result = await removePersonalSkillSource(id);
    this._isSaveBusy = false;

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete skill', STATUS_TYPE.ERR);
      return;
    }
    this._viewingSkillId = null;
    this._clearForm();
    this._isEditorOpen = false;
    await this._reload();
  }

  _openSkillMenu(e, id) {
    const article = this.shadowRoot.querySelector(`[data-skill-id="${id}"]`);
    article?.querySelector('nx-popover')?.show({ anchor: e.currentTarget });
  }

  _closeSkillMenu(id) {
    const article = this.shadowRoot.querySelector(`[data-skill-id="${id}"]`);
    article?.querySelector('nx-popover')?.close();
  }

  _openMcpMenu(e, key) {
    const article = this.shadowRoot.querySelector(`[data-mcp-key="${key}"]`);
    article?.querySelector('nx-popover')?.show({ anchor: e.currentTarget });
  }

  _closeMcpMenu(key) {
    const article = this.shadowRoot.querySelector(`[data-mcp-key="${key}"]`);
    article?.querySelector('nx-popover')?.close();
  }

  _onViewSkill(skillId) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._viewingSkillId = skillId;
    this._skillMdModalOpen = false;
    this._isFormEdit = false;
    this._catalogTab = 'skills';
    this._isEditorOpen = true;
  }

  _openSkillMdModal() {
    this._skillMdModalOpen = true;
    this._mountCMModal();
  }

  _closeSkillMdModal() {
    this._skillMdModalOpen = false;
    this._disposeCMModal();
  }

  async _mountCMModal() {
    const id = this._viewingSkillId;
    let body = this._skills[id] || '';
    if (!body) {
      body = await fetchSkillFileFromAo(id) || '';
      if (body) this._skills = { ...this._skills, [id]: body };
    }

    this._cmPortal = document.createElement('div');
    this._cmPortal.className = 'skill-md-portal';

    const backdrop = document.createElement('div');
    backdrop.className = 'skill-md-backdrop';
    backdrop.addEventListener('click', () => this._closeSkillMdModal());

    const modal = document.createElement('div');
    modal.className = 'skill-md-modal';
    modal.addEventListener('click', (e) => e.stopPropagation());

    const header = document.createElement('div');
    header.className = 'skill-md-modal-header';
    header.innerHTML = '<span class="skill-md-modal-title">SKILL.md</span>';
    const closeX = document.createElement('button');
    closeX.className = 'skill-md-modal-close';
    closeX.setAttribute('aria-label', 'Close');
    closeX.textContent = '\u00d7';
    closeX.addEventListener('click', () => this._closeSkillMdModal());
    header.appendChild(closeX);

    const editorHost = document.createElement('div');
    editorHost.className = 'skill-md-modal-body skill-md-cm-host';

    const footer = document.createElement('div');
    footer.className = 'skill-md-modal-footer';
    const meta = document.createElement('span');
    meta.className = 'skill-md-modal-meta';
    meta.textContent = `${(body.length / 1024).toFixed(1)}KB \u00b7 Markdown`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'skill-md-modal-close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => this._closeSkillMdModal());
    footer.append(meta, closeBtn);

    modal.append(header, editorHost, footer);
    backdrop.appendChild(modal);
    this._cmPortal.appendChild(backdrop);

    const styleLink = document.createElement('link');
    styleLink.rel = 'stylesheet';
    styleLink.href = new URL('./editor-panel.css', import.meta.url).href;
    this._cmPortal.appendChild(styleLink);

    document.body.appendChild(this._cmPortal);

    try {
      this._cmEditor = await createReadOnlyViewer(editorHost, body);
    } catch {
      editorHost.textContent = body;
      editorHost.style.whiteSpace = 'pre-wrap';
      editorHost.style.padding = '16px';
      editorHost.style.fontFamily = 'monospace';
    }
  }

  async _mountMemoryCM() {
    this._disposeMemoryCM();
    const host = this.shadowRoot.querySelector('.memory-cm-host');
    if (!host || !this._memory) return;
    try {
      this._memoryCM = await createReadOnlyViewer(host, this._memory);
    } catch {
      host.textContent = this._memory;
      host.style.whiteSpace = 'pre-wrap';
      host.style.padding = '16px';
      host.style.fontFamily = 'monospace';
    }
  }

  _disposeMemoryCM() {
    destroyEditor(this._memoryCM);
    this._memoryCM = null;
  }

  async _mountSkillCM() {
    this._disposeSkillCM();
    const host = this.shadowRoot.querySelector('.skill-body-cm-host');
    if (!host) return;
    try {
      this._skillCM = await createEditor(
        host,
        this._formSkillBody || '',
        (text) => {
          this._isSkillCMUpdating = true;
          this._formSkillBody = text;
          this._markDirty();
        },
      );
    } catch {
      const ta = document.createElement('textarea');
      ta.placeholder = 'Write or revise skill markdown';
      ta.value = this._formSkillBody || '';
      ta.addEventListener('input', (e) => {
        this._formSkillBody = e.target.value;
        this._markDirty();
      });
      host.appendChild(ta);
    }
  }

  _disposeSkillCM() {
    destroyEditor(this._skillCM);
    this._skillCM = null;
    this._isSkillCMUpdating = false;
  }

  _disposeCMModal() {
    destroyEditor(this._cmEditor);
    this._cmEditor = null;
    if (this._cmPortal) {
      this._cmPortal.remove();
      this._cmPortal = null;
    }
  }

  async _onEditSkill(skillId) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    const tab = this._catalogTab !== 'agents' ? 'skills' : 'agents';
    this._catalogTab = tab;

    // If this skill already has dirty edits, restore them instead of fetching fresh.
    const saved = this._dirtyForms[tab];
    if (saved?.formSkillId === skillId) {
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._formSkillId = skillId;
    this._formSkillBody = this._skills[skillId] || '';
    this._isFormEdit = true;
    this._statusMsg = '';
    this._activeToolRefs = null;
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms[tab];

    // Capture the context at the time of the request to guard against stale responses.
    const requestedId = skillId;
    const requestedTab = tab;
    const { text } = await readSkillMdFile(this._org, this._site, skillId);
    // Discard the response if the user navigated away before it resolved.
    if (text && !this._isFormDirty
      && this._formSkillId === requestedId
      && this._catalogTab === requestedTab) {
      this._formSkillBody = text;
    }
  }

  _onSelectAgent(agent) {
    this._selectedAgentId = agent?.id || null;
    this._formPromptTools = this._agentToolIds(agent, agent?.id === BUILTIN_AGENTS[0]?.id);
    this._isAgentViewTools = true;
    this._catalogTab = 'agents';
    this._isEditorOpen = true;
  }

  _openNewAgentEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearForm();
    this._isAgentViewTools = false;
    this._catalogTab = 'agents';
    this._isEditorOpen = true;
  }

  _onSelectMcp(row) {
    this._ensureMcpToolsLoaded();
    const serverId = String(row?.key || '').trim();
    if (!serverId || !this._mcpTools?.servers) return;
    const server = this._mcpTools.servers.find((s) => s.id === serverId);
    const refs = (server?.tools || []).map((t) => `mcp__${serverId}__${t.name}`);
    this._setActiveToolRefs(refs);
  }

  // ─── prompt CRUD ──────────────────────────────────────────────────────────

  async _onSavePrompt(status = STATUS.APPROVED) {
    const title = this._formPromptTitle.trim();
    const prompt = this._formPromptBody.trim();
    if (!title || !prompt) {
      this._setStatus('Title and prompt are required', STATUS_TYPE.ERR);
      return;
    }

    this._isSaveBusy = true;
    const result = await upsertPromptInConfig(
      this._org,
      this._site,
      {
        title,
        prompt,
        category: this._formPromptCategory,
        icon: this._formPromptIcon,
      },
      {
        status,
        originalTitle: this._formPromptOriginalTitle || undefined,
      },
    );

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to save prompt', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    this._setStatus('Prompt saved');
    this._clearDirty();
    this._isSaveBusy = false;
    this._clearForm();
    this._isEditorOpen = false;
    await this._reload();
  }

  async _onDeletePrompt() {
    const title = this._formPromptTitle.trim();
    if (!title) return;
    if (!await this._confirm('prompt', title)) return;
    this._isSaveBusy = true;

    const result = await deletePromptFromConfig(this._org, this._site, title);

    this._isSaveBusy = false;

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete prompt', STATUS_TYPE.ERR);
      return;
    }

    this._clearForm();
    this._isEditorOpen = false;
    await this._reload();
  }

  async _duplicatePrompt(row) {
    const title = `${row.title || 'Untitled'} (copy)`;
    const result = await upsertPromptInConfig(
      this._org,
      this._site,
      { title, prompt: row.prompt || '', category: row.category || '' },
      { status: STATUS.APPROVED },
    );
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to duplicate prompt', STATUS_TYPE.ERR);
    }
    await this._reload();
  }

  async _deletePromptDirect(row) {
    const title = row.title || '';
    if (!title) return;
    if (!await this._confirm('prompt', title)) return;
    const result = await deletePromptFromConfig(this._org, this._site, title);
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete prompt', STATUS_TYPE.ERR);
      return;
    }
    if (this._isFormPromptEdit && this._formPromptTitle === title) this._closeEditor();
    await this._reload();
  }

  async _onRunPrompt() {
    const prompt = this._formPromptBody.trim();
    if (!prompt) return;
    // The chat we render lives in the drawer inside this component's shadow
    // root, so document.querySelector never reaches it. Open the drawer if it's
    // closed (that also imports + mounts nx-chat), wait for Lit to render, then
    // prefer the shadow-DOM chat and fall back to a document-level one
    // (canvas/browse mount nx-chat at the document level).
    if (this.chatImportUrl && !this._isChatOpen) await this._toggleChat();
    await this.updateComplete;
    const chat = this.shadowRoot.querySelector('nx-chat')
      ?? document.querySelector('nx-chat');
    if (!chat) {
      this._setStatus('Chat is not available', STATUS_TYPE.ERR);
      return;
    }
    chat.setPrompt(prompt, { autoSend: true });
    this._setStatus('Sent to chat');
  }

  // ─── MCP register ─────────────────────────────────────────────────────────

  async _onRegisterMcp() {
    const filledHeaders = this._mcpHeaders.filter((h) => h.name.trim());
    const namesSeen = new Set();
    const dupes = [];
    filledHeaders.forEach((h) => {
      const lower = h.name.trim().toLowerCase();
      if (namesSeen.has(lower)) dupes.push(h.name.trim());
      namesSeen.add(lower);
    });
    if (dupes.length) {
      this._setStatus(`Duplicate header name: ${dupes[0]}`, STATUS_TYPE.ERR);
      return;
    }
    this._isSaveBusy = true;
    const isUpdate = Boolean(this._editingMcpKey);
    const result = await registerMcpServer(
      this._org,
      this._site,
      this._mcpKey,
      this._mcpUrl,
      this._mcpDescription,
      this._mcpHeaders,
    );
    if (!result.ok) this._setStatus(result.error || 'Failed', STATUS_TYPE.ERR);
    else {
      this._mcpKey = '';
      this._mcpUrl = '';
      this._mcpDescription = '';
      this._mcpHeaders = [];
      this._editingMcpKey = null;
      this._clearDirty();
      this._setStatus(isUpdate ? 'MCP server updated' : 'MCP server registered');
    }
    this._isSaveBusy = false;
    await this._reload();
  }

  async _onDeleteMcpDirect(row) {
    const key = String(row?.key || '').trim();
    if (!key) return;
    if (!await this._confirm('MCP server', key)) return;
    this._isSaveBusy = true;
    const result = await deleteMcpServer(this._org, this._site, key);
    this._isSaveBusy = false;
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to remove MCP server', STATUS_TYPE.ERR);
      return;
    }
    if (this._editingMcpKey === key) this._closeEditor();
    await this._reload();
  }

  _clearMcpForm() {
    this._mcpKey = '';
    this._mcpUrl = '';
    this._mcpDescription = '';
    this._mcpHeaders = [];
    this._editingMcpKey = null;
    this._viewingMcpServerId = null;
  }

  _onEditMcp(row) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    // If this MCP already has dirty edits, restore them.
    const saved = this._dirtyForms.mcps;
    if (saved?.editingMcpKey === row.key) {
      this._catalogTab = 'mcps';
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._editingMcpKey = row.key;
    this._viewingMcpServerId = row.key;
    this._mcpKey = row.key;
    this._mcpUrl = row.url || row.value || '';
    this._mcpDescription = row.description || '';
    this._mcpHeaders = rowHeadersToArray(row);
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms.mcps;
  }

  async _onToggleMcpEnabled(row) {
    if (!row?.key || skillRowStatus(row) !== STATUS.APPROVED) return;
    const key = String(row.key);
    const token = `mcp:${key}`;
    const nextEnabled = !skillRowEnabled(row);
    this._mcpEnableBusy = { ...this._mcpEnableBusy, [token]: true };
    const res = await setMcpServerEnabled(this._org, this._site, key, nextEnabled);
    this._mcpEnableBusy = { ...this._mcpEnableBusy, [token]: false };
    if (!res.ok) {
      this._setStatus(res.error || 'Could not update MCP state', STATUS_TYPE.ERR);
      return;
    }
    await this._reload();
  }

  _onViewMcpTools(serverId) {
    this._ensureMcpToolsLoaded();
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearMcpForm();
    this._viewingMcpServerId = serverId;
    this._toolsSearch = '';
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
  }

  _isEventFromNestedInteractiveControl(e) {
    const currentTarget = e?.currentTarget;
    const target = e?.target;
    if (!(currentTarget instanceof Element) || !(target instanceof Element)) return false;
    const INTERACTIVE_SELECTOR = [
      'button',
      '[role="button"]',
      '[role="menuitem"]',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const nestedInteractive = target.closest(INTERACTIVE_SELECTOR);
    return Boolean(nestedInteractive && nestedInteractive !== currentTarget);
  }

  _onCardClick(e, onActivate) {
    if (this._isEventFromNestedInteractiveControl(e)) return;
    onActivate();
  }

  _onCardKeydown(e, onActivate) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (this._isEventFromNestedInteractiveControl(e)) return;
    e.preventDefault();
    onActivate();
  }

  _onMcpCardClick(e, onActivate) {
    this._onCardClick(e, onActivate);
  }

  _onMcpCardKeydown(e, onActivate) {
    this._onCardKeydown(e, onActivate);
  }

  async _onToggleToolEnabled(serverId, toolName, enabled, onRollback) {
    const key = `${serverId}/${toolName}`;
    const previous = this._toolOverrides[key];
    this._toolOverrides = { ...this._toolOverrides, [key]: enabled };
    try {
      if (enabled) {
        await deleteToolOverride(this._org, this._site, serverId, toolName);
        this._setStatus(`Tool enabled: ${toolName}`);
      } else {
        await setToolOverride(this._org, this._site, serverId, toolName, false);
        this._setStatus(`Tool disabled — ${toolName} won't be available until re-enabled.`, STATUS_TYPE.WARN);
      }
    } catch {
      // Persist failed — roll back the optimistic update so the UI stays truthful.
      const rolled = { ...this._toolOverrides };
      if (previous === undefined) delete rolled[key];
      else rolled[key] = previous;
      this._toolOverrides = rolled;
      onRollback?.();
      this._setStatus(`Failed to ${enabled ? 'enable' : 'disable'} ${toolName}`, STATUS_TYPE.ERR);
    }
  }

  /**
   * Parse a display tool ID (e.g. "mcp__browser__search" or "da_get_source")
   * into the {serverId, toolName} pair used by the tool-overrides sheet.
   */
  _parseToolId(toolId) {
    if (toolId.startsWith('mcp__')) {
      const [, serverId, ...rest] = toolId.split('__');
      return { serverId, toolName: rest.join('__') };
    }
    return { serverId: 'da', toolName: toolId };
  }

  // ─── prompt → chat dispatch ───────────────────────────────────────────────

  _dispatchPromptToChat(eventName, prompt) {
    const type = eventName.includes('send') ? 'prompt-send' : 'prompt-add';
    sendMessage(type, { prompt: String(prompt || '') });
  }

  async _onSaveAgent() {
    const rawId = this._newAgentId.trim().replace(/\.json$/i, '');
    if (!rawId) {
      this._setStatus('Agent id required', STATUS_TYPE.ERR);
      return;
    }
    const id = toSafeId(rawId);
    if (!id) {
      this._setStatus('Agent ID must contain at least one alphanumeric character', STATUS_TYPE.ERR);
      return;
    }
    if (id !== rawId) this._newAgentId = id;
    const name = this._newAgentName.trim() || id;
    this._isSaveBusy = true;
    const preset = {
      name,
      description: '',
      systemPrompt: '',
      skills: [],
      mcpServers: [],
    };
    const result = await saveAgentPresetFile(this._org, this._site, id, preset);
    this._isSaveBusy = false;
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to save agent file', STATUS_TYPE.ERR);
      return;
    }
    this._newAgentId = '';
    this._newAgentName = '';
    this._clearDirty();
    this._setStatus('Agent file saved');
    await this._reload();
  }

  async _onDeleteAgent(agent) {
    const id = agent?.id || agent?.preset?.id;
    if (!id) return;
    if (!await this._confirm('agent', id)) return;
    this._isSaveBusy = true;
    const result = await deleteAgentPresetFile(this._org, this._site, id);
    this._isSaveBusy = false;
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete agent', STATUS_TYPE.ERR);
      return;
    }
    this._closeEditor();
    this._setStatus('Agent deleted');
    this._agentsLoadInFlight = false;
    this._agents = [];
    await this._reload();
  }

  // ─── tool references ──────────────────────────────────────────────────────

  get _toolRefs() {
    if (this._activeToolRefs !== null) return this._activeToolRefs;
    return extractToolRefs(this._formSkillBody);
  }

  _setActiveToolRefs(refs) {
    this._activeToolRefs = refs;
  }

  async _loadMemory() {
    const got = await fetchSiteSourceText(this._org, this._site, '.da/agent/memory.md');
    // null signals a fetch error; '' signals a successful fetch of an empty/non-existent file
    this._memory = got.error ? null : (got.text || '');
  }

  _onGateSubmit(e) {
    e.preventDefault();
    const org = this._gateOrg.trim();
    const site = this._gateSite.trim();
    if (!org || !site) return;
    window.location.hash = `#/${org}/${site}`;
  }

  // ─── render: top level ────────────────────────────────────────────────────

  /**
   * Build a plain ViewModel object for renderers.
   * All private state and event handlers are exposed under public names so
   * renderers never access `host._xxx` directly, satisfying no-underscore-dangle.
   */
  _buildViewModel() {
    return {
      // ── state ──────────────────────────────────────────────────────────────
      canWrite: this._canWrite,
      catalogTab: this._catalogTab,
      catalogFilter: this._catalogFilter,
      isChatOpen: this._isChatOpen,
      chatAgentId: this.chatAgentId,
      isEditorOpen: this._isEditorOpen,
      isFormDirty: this._isFormDirty,
      isFormEdit: this._isFormEdit,
      isFormPromptEdit: this._isFormPromptEdit,
      isAgentViewTools: this._isAgentViewTools,
      isSaveBusy: this._isSaveBusy,
      hasSuggestion: this._hasSuggestion,
      statusMsg: this._statusMsg,
      statusType: this._statusType,
      promptSearch: this._promptSearch,
      skills: this._skills,
      skillStatuses: this._skillStatuses,
      skillScopes: this._skillScopes,
      skillDescriptions: this._skillDescriptions,
      skillDisplayNames: this._skillDisplayNames,
      skillLineCounts: this._skillLineCounts,
      prompts: this._prompts,
      agents: this._agents,
      agentRows: this._agentRows,
      mcpRows: this._mcpRows,
      mcpTools: this._mcpTools,
      mcpEnableBusy: this._mcpEnableBusy,
      configuredMcpServers: this._configuredMcpServers,
      viewingSkillId: this._viewingSkillId,
      skillMdModalOpen: this._skillMdModalOpen,
      selectedAgentId: this._selectedAgentId,
      viewingMcpServerId: this._viewingMcpServerId,
      editingMcpKey: this._editingMcpKey,
      toolOverrides: this._toolOverrides,
      toolsSearch: this._toolsSearch,
      toolsGroupCollapsed: this._toolsGroupCollapsed,
      showDepTree: this._showDepTree,
      catalogViewMode: this._catalogViewMode,
      agentFilter: this._agentFilter,
      formSkillId: this._formSkillId,
      formSkillBody: this._formSkillBody,
      newAgentId: this._newAgentId,
      newAgentName: this._newAgentName,
      formPromptTitle: this._formPromptTitle,
      formPromptCategory: this._formPromptCategory,
      formPromptIcon: this._formPromptIcon,
      formPromptBody: this._formPromptBody,
      formPromptTools: this._formPromptTools,
      mcpKey: this._mcpKey,
      mcpUrl: this._mcpUrl,
      mcpDescription: this._mcpDescription,
      mcpHeaders: this._mcpHeaders,
      memory: this._memory,
      // ── form setters ───────────────────────────────────────────────────────
      setPromptSearch: (v) => { this._promptSearch = v; },
      setFormSkillId: (v) => { this._formSkillId = v; this._markDirty(); },
      setFormSkillBody: (v) => { this._formSkillBody = v; this._markDirty(); },
      setNewAgentId: (v) => { this._newAgentId = v; this._markDirty(); },
      setNewAgentName: (v) => { this._newAgentName = v; this._markDirty(); },
      setFormPromptTitle: (v) => { this._formPromptTitle = v; this._markDirty(); },
      setFormPromptCategory: (v) => { this._formPromptCategory = v; this._markDirty(); },
      setFormPromptIcon: (v) => { this._formPromptIcon = v; this._markDirty(); },
      setFormPromptBody: (v) => { this._formPromptBody = v; this._markDirty(); },
      setFormPromptTools: (v) => { this._formPromptTools = v; },
      setMcpKey: (v) => { this._mcpKey = v; this._markDirty(); },
      setMcpUrl: (v) => { this._mcpUrl = v; this._markDirty(); },
      setMcpDescription: (v) => { this._mcpDescription = v; this._markDirty(); },
      setMcpHeader: (idx, field, value) => {
        const next = this._mcpHeaders.map((h, i) => (i === idx ? { ...h, [field]: value } : h));
        this._mcpHeaders = next;
        this._markDirty();
      },
      addMcpHeader: () => {
        this._mcpHeaders = [...this._mcpHeaders, { name: '', value: '' }];
        this._markDirty();
      },
      removeMcpHeader: (idx) => {
        this._mcpHeaders = this._mcpHeaders.filter((_, i) => i !== idx);
        this._markDirty();
      },
      setToolsSearch: (v) => { this._toolsSearch = v; },
      setToolsGroupCollapsed: (key, isCollapsed) => {
        this._toolsGroupCollapsed = { ...this._toolsGroupCollapsed, [key]: isCollapsed };
      },
      setShowDepTree: (v) => { this._showDepTree = v; },
      setCatalogFilter: (v) => { this._catalogFilter = v; },
      setCatalogViewMode: (v) => { this._catalogViewMode = v; },
      onSetAgentFilter: (v) => { this._agentFilter = v; },
      // ── actions / event handlers ───────────────────────────────────────────
      onTabChange: (id) => this._onTabChange(id),
      onToggleChat: () => this._toggleChat(),
      onCloseEditor: () => this._closeEditor(),
      onDismissForm: () => this._dismissForm(),
      onMarkDirty: () => this._markDirty(),
      onCardClick: (e, fn) => this._onCardClick(e, fn),
      onCardKeydown: (e, fn) => this._onCardKeydown(e, fn),
      onMcpCardClick: (e, fn) => this._onMcpCardClick(e, fn),
      onMcpCardKeydown: (e, fn) => this._onMcpCardKeydown(e, fn),
      onViewSkill: (id) => this._onViewSkill(id),
      onEditSkill: (id) => this._onEditSkill(id),
      onChangeSkillStatus: (id, status) => this._onChangeSkillStatus(id, status),
      onOpenSkillMdModal: () => this._openSkillMdModal(),
      onCloseSkillMdModal: () => this._closeSkillMdModal(),
      onDeleteSkillById: (id) => this._onDeleteSkillById(id),
      onOpenSkillMenu: (e, id) => this._openSkillMenu(e, id),
      onCloseSkillMenu: (id) => this._closeSkillMenu(id),
      onSaveSkill: (status) => this._onSaveSkill(status),
      onDeleteSkill: this._onDeleteSkill.bind(this),
      onSelectAgent: (agent) => this._onSelectAgent(agent),
      onSaveAgent: this._onSaveAgent.bind(this),
      onDeleteAgent: (agent) => this._onDeleteAgent(agent),
      onOpenEditor: (row) => this._openEditor(row),
      onSavePrompt: (status) => this._onSavePrompt(status),
      onDeletePrompt: this._onDeletePrompt.bind(this),
      onDispatchPromptToChat: (event, body) => this._dispatchPromptToChat(event, body),
      onRunPrompt: () => this._onRunPrompt(),
      onDuplicatePrompt: (row) => this._duplicatePrompt(row),
      onDeletePromptDirect: (row) => this._deletePromptDirect(row),
      onViewMcpTools: (id) => this._onViewMcpTools(id),
      onEditMcp: (row) => this._onEditMcp(row),
      onRegisterMcp: this._onRegisterMcp.bind(this),
      onToggleMcpEnabled: (row) => this._onToggleMcpEnabled(row),
      onDeleteMcpDirect: (row) => this._onDeleteMcpDirect(row),
      onOpenMcpMenu: (e, key) => this._openMcpMenu(e, key),
      onCloseMcpMenu: (key) => this._closeMcpMenu(key),
      onToggleToolEnabled: (serverId, name, enabled, rollback) => (
        this._onToggleToolEnabled(serverId, name, enabled, rollback)
      ),
      onSetStatus: (msg, type) => this._setStatus(msg, type),
      // ── queries ────────────────────────────────────────────────────────────
      getAgentToolIds: (agent, isBuiltin) => this._agentToolIds(agent, isBuiltin),
      parseToolId: (toolId) => this._parseToolId(toolId),
      // ── TAB_ACTIONS openers ────────────────────────────────────────────────
      onPickSkillFile: () => this._onPickSkillFile(),
      openNewAgentEditor: () => this._openNewAgentEditor(),
      openNewEditor: () => this._openNewEditor(),
      openNewMcpEditor: () => this._openNewMcpEditor(),
    };
  }

  render() {
    if (!this._org || !this._site) {
      return html`
        <div class="gate">
          <div class="gate-card">
            <h2 class="gate-heading">Skills Editor</h2>
            <p class="gate-desc">Enter your organization and site (same as in browse or canvas). You will manage skills, agents, prompts, and MCP servers for that repository.</p>
            <form class="form gate-form" @submit=${this._onGateSubmit}>
              <label class="gate-label">
                <span>Organization</span>
                <input
                  type="text"
                  placeholder="e.g. adobecom"
                  autocomplete="organization"
                  .value=${this._gateOrg}
                  @input=${(e) => { this._gateOrg = e.target.value; }}
                />
              </label>
              <label class="gate-label">
                <span>Site</span>
                <input
                  type="text"
                  placeholder="e.g. bacom"
                  .value=${this._gateSite}
                  @input=${(e) => { this._gateSite = e.target.value; }}
                />
              </label>
              <div class="editor-actions gate-actions">
                <button
                  type="submit"
                  data-variant="accent"
                  ?disabled=${!this._gateOrg.trim() || !this._gateSite.trim()}
                >Continue</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }
    if (this._isLoading) {
      return html`<div class="loading" aria-live="polite">Loading capabilities\u2026</div>`;
    }
    const rootCls = [
      'root',
      this._isChatOpen ? 'is-chat-open' : '',
    ].filter(Boolean).join(' ');

    const vm = this._buildViewModel();
    const dlg = this._confirmDialog;
    return html`<div class="${rootCls}" role="region" aria-label="Skills Editor">
      ${this._refreshingCount > 0 ? html`
        <div class="refresh-indicator" role="status" aria-live="polite">
          <span class="refresh-indicator-label">Auto-refreshing capabilities…</span>
          <span class="refresh-indicator-track"><span class="refresh-indicator-bar"></span></span>
        </div>
      ` : nothing}
      <div class="content-area">
        ${renderChatDrawer(vm)}
        <div class="main-area">
          ${renderTopNav(vm)}
          <div class="panels">
            ${renderListCol(vm)}
          </div>
        </div>
      </div>
      ${dlg ? html`
        <div class="confirm-backdrop" @click=${() => this._closeConfirm(false)}>
          <div class="confirm-dialog" role="alertdialog"
               aria-labelledby="confirm-title"
               aria-describedby="confirm-desc"
               @click=${(e) => e.stopPropagation()}>
            <p id="confirm-title" class="confirm-heading">
              You're about to delete ${dlg.itemType}:
            </p>
            <p id="confirm-desc" class="confirm-id"><code>${dlg.itemId}</code></p>
            <p class="confirm-warning">This action cannot be undone</p>
            <div class="confirm-actions">
              <button class="confirm-btn confirm-btn-cancel"
                      @click=${() => this._closeConfirm(false)}>Cancel</button>
              <button class="confirm-btn confirm-btn-confirm"
                      @click=${() => this._closeConfirm(true)}>Confirm</button>
            </div>
          </div>
        </div>
      ` : nothing}
    </div>`;
  }
}

if (!customElements.get('nx-skills-editor')) customElements.define('nx-skills-editor', NxSkillsEditor);
