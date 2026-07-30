/**
 * Data layer for Skills Editor — config sheet CRUD, .md file I/O,
 * MCP / agent-presets, and chat suggestion events.
 *
 * Ported from exp-workspace nx/blocks/browse/skills-lab-api.js,
 * adapted for nx2 imports and the skills-editor naming convention.
 */

import { DA_ORIGIN, daFetch, getToken, waitForImsToken } from './utils/da-fetch.js';
import { parseSheetBoolean, normaliseRowKey, isSafeId, isSafeSubPath } from './utils/sheet-utils.js';

// ─── agent origin ───────────────────────────────────────────────────────────

export function getAgentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('ref') === 'local' || params.get('nx') === 'local';
  return isLocal ? 'http://localhost:4002' : 'https://da-agent.adobeaem.workers.dev';
}

// ─── lightweight in-memory caches (per org/site) ────────────────────────────

const CACHE_TTL_MS = 15000;
const configCache = new Map();
const inflightConfig = new Map();
const skillMdCache = new Map();
const inflightSkillMd = new Map();

function siteKey(org, site) {
  return site ? `${org}/${site}` : String(org);
}

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateConfigCache(org, site) {
  configCache.delete(siteKey(org, site));
  inflightConfig.delete(siteKey(org, site));
}

function invalidateSkillMdCache(org, site) {
  skillMdCache.delete(siteKey(org, site));
  inflightSkillMd.delete(siteKey(org, site));
}

// ─── chat ↔ skills-editor suggestion (sessionStorage + custom events) ────────

const SKILL_CHAT_PROSE_KEY = 'da-skills-editor-skill-chat-prose';
const LEGACY_SKILL_CHAT_PROSE_KEY = 'da-skills-lab-skill-chat-prose';
const SUGGEST_HANDOFF_KEY = 'da-skills-editor-suggestion';
const LEGACY_SUGGEST_HANDOFF_KEY = 'da-skills-lab-suggest-handoff';

export const DA_SKILLS_EDITOR_SUGGESTION_HANDOFF = 'da-skills-editor-suggestion-handoff';
export const DA_SKILLS_EDITOR_FORM_DISMISS = 'da-skills-editor-form-column-dismiss';
export const DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT = 'da-skills-editor-clear-form-from-chat';
export const DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT = 'da-skills-editor-prompt-add-to-chat';
export const DA_SKILLS_LAB_SUGGESTION_HANDOFF = 'da-skills-lab-suggestion-handoff';
export const DA_SKILLS_LAB_FORM_DISMISS = 'da-skills-lab-form-column-dismiss';
export const DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT = 'da-skills-lab-clear-form-from-chat';
export const DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT = 'da-skills-lab-prompt-add-to-chat';

export function setSkillChatProse(text) {
  try {
    if (text && String(text).trim()) {
      const prose = String(text);
      sessionStorage.setItem(SKILL_CHAT_PROSE_KEY, prose);
      sessionStorage.setItem(LEGACY_SKILL_CHAT_PROSE_KEY, prose);
    } else {
      sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
      sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    }
  } catch { /* noop */ }
}

export function consumeSkillChatProse() {
  try {
    const t = sessionStorage.getItem(SKILL_CHAT_PROSE_KEY)
      || sessionStorage.getItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    return t && String(t).trim() ? String(t) : '';
  } catch { return ''; }
}

/** @param {{ prose?: string, id?: string, body?: string } | null} payload */
export function setSuggestionHandoff(payload) {
  try {
    if (!payload || typeof payload !== 'object') {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
      return;
    }
    const { prose = '', id = '', body = '' } = payload;
    if (!prose.trim() && !id.trim() && !body.trim()) {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
      return;
    }
    const serialized = JSON.stringify({ prose, id: id.trim(), body });
    sessionStorage.setItem(SUGGEST_HANDOFF_KEY, serialized);
    sessionStorage.setItem(LEGACY_SUGGEST_HANDOFF_KEY, serialized);
  } catch { /* noop */ }
}

/** @returns {{ prose: string, id: string, body: string } | null} */
export function consumeSuggestionHandoff() {
  try {
    const raw = sessionStorage.getItem(SUGGEST_HANDOFF_KEY)
      || sessionStorage.getItem(LEGACY_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return null;
    return { prose: String(payload.prose || ''), id: String(payload.id || '').trim(), body: String(payload.body || '') };
  } catch { return null; }
}

export function clearSuggestionSession() {
  try {
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
  } catch { /* noop */ }
}

// ─── config sheet helpers ───────────────────────────────────────────────────

function rowEnabledState(row, defaultEnabled = true) {
  if (!row || typeof row !== 'object') return defaultEnabled;
  const explicitEnabled = parseSheetBoolean(row.enabled);
  if (typeof explicitEnabled === 'boolean') return explicitEnabled;
  const explicitDisabled = parseSheetBoolean(row.disabled);
  if (typeof explicitDisabled === 'boolean') return !explicitDisabled;
  return defaultEnabled;
}

function syncConfigMeta(cfg) {
  const names = Object.keys(cfg).filter(
    (k) => !k.startsWith(':') && !k.startsWith('private-') && typeof cfg[k] === 'object',
  );
  if (names.length) {
    cfg[':names'] = names;
    cfg[':type'] = 'multi-sheet';
  }
}

export async function saveDaConfig(org, site, fullConfig) {
  syncConfigMeta(fullConfig);
  const path = site ? `${org}/${site}` : org;
  const body = new FormData();
  body.append('config', JSON.stringify(fullConfig));
  const resp = await daFetch(`${DA_ORIGIN}/config/${path}/`, { method: 'POST', body });
  if (resp.ok) invalidateConfigCache(org, site);
  return { ok: resp.ok, status: resp.status };
}

const inflightBootstrap = new Map();

async function materializeConfigAfter404(org, site) {
  const path = site ? `${org}/${site}` : org;
  let boot = inflightBootstrap.get(path);
  if (!boot) {
    boot = saveDaConfig(org, site, {});
    inflightBootstrap.set(path, boot);
    boot.finally(() => inflightBootstrap.delete(path)).catch(() => { /* bootstrap cleanup */ });
  }
  await boot;
}

const EMPTY_CONFIG = Object.freeze({
  ok: true,
  json: {},
  mcpRows: [],
  agentRows: [],
  configuredMcpServers: {},
  configuredMcpServerHeaders: {},
  toolOverrides: {},
});

const TOOL_OVERRIDES_SHEET = 'tool-overrides';

const AUTH_FAIL = {
  ok: false,
  status: 401,
  error: 'Unauthorized',
  mcpRows: [],
  agentRows: [],
  configuredMcpServers: {},
  configuredMcpServerHeaders: {},
  toolOverrides: {},
};

export async function fetchDaConfigSheets(org, site, options = {}) {
  const cacheKey = siteKey(org, site);
  if (!options.force) {
    const cached = getCached(configCache, cacheKey);
    if (cached) return cached;
    const inflight = inflightConfig.get(cacheKey);
    if (inflight) return inflight;
  }

  const path = site ? `${org}/${site}` : org;
  const url = `${DA_ORIGIN}/config/${path}/`;
  const promise = (async () => {
    try {
      let resp = await daFetch(url);
      if (resp.status === 401) return { ...AUTH_FAIL };
      if (resp.status === 404) {
        await materializeConfigAfter404(org, site);
        resp = await daFetch(url);
        if (resp.status === 401) return { ...AUTH_FAIL };
      }

      if (!resp.ok) {
        return resp.status === 404
          ? { ...EMPTY_CONFIG }
          // eslint-disable-next-line max-len
          : {
            ok: false,
            status: resp.status,
            mcpRows: [],
            agentRows: [],
            configuredMcpServers: {},
            configuredMcpServerHeaders: {},
            toolOverrides: {},
          };
      }

      const json = await resp.json();
      const mcpRows = json?.['mcp-servers']?.data || [];
      const servers = {};
      const serverHeaders = {};
      mcpRows.forEach((row) => {
        const rowUrl = row.url || row.value;
        const s = String(row?.status ?? '').trim().toLowerCase();
        const approved = s !== 'draft';
        const enabled = rowEnabledState(row, true);
        const rowKey = String(row?.key || '').trim();
        if (rowKey && rowUrl && approved && enabled) {
          servers[rowKey] = rowUrl;
          // eslint-disable-next-line no-use-before-define
          const hdrs = parseRowHeaders(row);
          if (Object.keys(hdrs).length) serverHeaders[rowKey] = hdrs;
        }
      });
      const agentRows = (json?.agents?.data || [])
        .filter((r) => r.key && (r.url || r.value))
        .map((r) => ({ ...r, url: r.url || r.value }));
      const toolOverrides = {};
      (json?.[TOOL_OVERRIDES_SHEET]?.data ?? []).forEach((r) => {
        const rowKey = String(r.key || '').trim();
        if (rowKey) toolOverrides[rowKey] = rowEnabledState(r, true);
      });

      const result = {
        ok: true,
        json,
        mcpRows,
        configuredMcpServers: servers,
        configuredMcpServerHeaders: serverHeaders,
        agentRows,
        toolOverrides,
      };
      setCached(configCache, cacheKey, result);
      return result;
    } catch (err) {
      return {
        ok: false,
        error: String(err?.message ?? err),
        mcpRows: [],
        agentRows: [],
        configuredMcpServers: {},
        configuredMcpServerHeaders: {},
        toolOverrides: {},
      };
    } finally {
      inflightConfig.delete(cacheKey);
    }
  })();
  inflightConfig.set(cacheKey, promise);
  return promise;
}

// ─── generic config sheet mutation helpers ──────────────────────────────────
// Every config sheet mutator follows the same flow:
//   1. fetchDaConfigSheets  2. ensure sheet exists  3. mutate data[]  4. saveDaConfig
// These two helpers centralize that lifecycle and the { ok, error, status } shape.

/**
 * Upsert a row in a config sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} sheetName
 * @param {(row: object) => boolean} matchFn — identifies existing row
 * @param {(prev: object) => object} buildRowFn — receives prev row ({} if new) and returns next row
 * @param {string} label — human-readable name for error messages (e.g. "skill", "prompt")
 */
async function upsertSheetRow(org, site, sheetName, matchFn, buildRowFn, label = 'row') {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error || `Could not load config (${loaded.status})` };
  }
  const cfg = { ...(loaded.json || {}) };
  if (!cfg[sheetName]) cfg[sheetName] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[sheetName];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex(matchFn);
  const prev = idx >= 0 ? data[idx] : {};
  const nextRow = buildRowFn(prev);
  if (idx >= 0) data[idx] = nextRow;
  else data.push(nextRow);
  cfg[sheetName] = { ...sheet, data, total: data.length };
  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `${label} save failed (${save.status})` };
  return { ok: true, status: save.status };
}

/**
 * Delete a row from a config sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} sheetName
 * @param {(row: object) => boolean} matchFn — identifies the row to remove
 * @param {string} label
 */
async function deleteSheetRow(org, site, sheetName, matchFn, label = 'row') {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error || `Could not load config (${loaded.status})` };
  }
  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[sheetName];
  if (!sheet?.data?.length) return { ok: false, error: `No ${label}s in config` };
  const data = sheet.data.filter((r) => !matchFn(r));
  if (data.length === sheet.data.length) return { ok: false, error: `${label} not found` };
  cfg[sheetName] = { ...sheet, data, total: data.length };
  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `${label} delete failed (${save.status})` };
  return { ok: true, status: save.status };
}

// ─── skills CRUD (config sheet + .md file) ──────────────────────────────────

const SKILLS_SHEET = 'skills';

const recentlyDeletedSkills = new Set();
const DELETED_GUARD_MS = 15_000;

export function markSkillDeleted(skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  recentlyDeletedSkills.add(id);
  setTimeout(() => recentlyDeletedSkills.delete(id), DELETED_GUARD_MS);
}

export function isSkillRecentlyDeleted(skillId) {
  return recentlyDeletedSkills.has(String(skillId || '').trim().replace(/\.md$/i, ''));
}

export function skillRowStatus(row) {
  if (!row || typeof row !== 'object') return 'approved';
  return String(row.status ?? '').trim().toLowerCase() === 'draft' ? 'draft' : 'approved';
}

export function skillRowEnabled(row) {
  return rowEnabledState(row, true);
}

export function skillsRowsToMapAndStatuses(rows) {
  const map = {};
  const statuses = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const key = String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '');
    const content = String(r.content ?? r.value ?? r.body ?? '');
    if (key && content) {
      map[key] = content;
      statuses[key] = skillRowStatus(r);
    }
  });
  return { map, statuses };
}

/**
 * Load all skill .md files from /.da/skills/ and return them as { id → markdown } map.
 * Merges with config sheet: .md body wins, config status wins.
 */
async function loadSkillsFromMdFiles(org, site) {
  const cacheKey = siteKey(org, site);
  const cached = getCached(skillMdCache, cacheKey);
  if (cached) return cached;
  const inflight = inflightSkillMd.get(cacheKey);
  if (inflight) return inflight;

  const folder = `/${org}/${site}/.da/skills`;
  const promise = (async () => {
    try {
      const resp = await daFetch(`${DA_ORIGIN}/list${folder}`);
      if (!resp.ok) return {};
      const payload = await resp.json();
      const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
      const out = {};
      await Promise.all(items.map(async (item) => {
        const ext = String(item?.ext || '').trim().toLowerCase();
        const name = String(item?.name || '').trim();
        if (!name) return;
        if (ext !== 'md' && !name.toLowerCase().endsWith('.md')) return;
        const pathStr = typeof item?.path === 'string' ? item.path.trim() : '';
        let filename;
        if (pathStr) {
          filename = pathStr.split('/').pop();
        } else if (ext === 'md') {
          filename = `${name}.md`;
        } else {
          filename = name;
        }
        const fileKey = filename.replace(/\.md$/i, '').trim();
        if (!fileKey) return;
        const srcPath = pathStr || `${folder}/${filename}`;
        try {
          const r = await daFetch(`${DA_ORIGIN}/source${srcPath}`);
          if (!r.ok) return;
          const text = await r.text();
          if (text) out[fileKey] = text;
        } catch { /* skip */ }
      }));
      setCached(skillMdCache, cacheKey, out);
      return out;
    } catch {
      return {};
    } finally {
      inflightSkillMd.delete(cacheKey);
    }
  })();
  inflightSkillMd.set(cacheKey, promise);
  return promise;
}

export async function mergeSkillsWithMdFiles(sheetRows, org, site) {
  const fileMap = await loadSkillsFromMdFiles(org, site);
  const { map: cfgMap, statuses: cfgStatuses } = skillsRowsToMapAndStatuses(sheetRows || []);
  // .md body wins over config body; config status wins
  const mergedMap = { ...cfgMap, ...fileMap };
  const mergedStatuses = { ...cfgStatuses };
  Object.keys(fileMap).forEach((k) => {
    if (!mergedStatuses[k]) mergedStatuses[k] = 'approved';
  });
  return { map: mergedMap, statuses: mergedStatuses };
}

export async function loadSkillsWithStatuses(org, site, loadedConfig = null, options = {}) {
  const loaded = loadedConfig || await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return { map: {}, statuses: {} };
  if (options.includeMdFiles === false) {
    return skillsRowsToMapAndStatuses(loaded.json[SKILLS_SHEET]?.data);
  }
  return mergeSkillsWithMdFiles(loaded.json[SKILLS_SHEET]?.data, org, site);
}

// ─── AO skills catalog (read-only id list — replaces the config-sheet list) ─
// Mirrors chat-controller-ao.js's _fetchSkillsFromApi()/parseSkillsListResponse()
// in da-nx: GET /api/v1/skills?manifest_id=experience-workspace, IMS bearer +
// x-tenant-id (IMS Org ID, not the DA org slug). Content/status still come from
// DA (config sheet + .da/skills/*.md) — AO only tells us which ids to show.

const AO_HTTP_BASE = {
  prod: 'https://agent-orchestrator-prod-va7.adobe.io',
  stage: 'https://agent-orchestrator-stage-va7.adobe.io',
};

const AO_MANIFEST_ID = 'experience-workspace';

function aoEnv() {
  const { hostname } = window.location;
  if (hostname.endsWith('.aem.live')) return 'prod';
  if (!['--', 'local'].some((check) => hostname.includes(check))) return 'prod';
  return 'stage';
}

// ims.js's own tenantId is a human-readable label, not the "ORGID@AdobeOrg" shape
// AO's x-tenant-id expects — pull that from owningEntity instead, same as da-nx.
function getImsOrgId(projectedProductContext) {
  return projectedProductContext?.find((p) => p.prodCtx?.owningEntity)?.prodCtx.owningEntity;
}

function parseAoSkillsResponse(json) {
  const skills = Array.isArray(json?.skills) ? json.skills : null;
  if (!skills) return null;
  return skills
    .filter((s) => !s?.hidden && s?.user_invocable !== false)
    .map((s) => ({
      id: String(s?.name || '').trim(),
      scope: s?.scope,
      description: String(s?.description || '').trim(),
      displayName: String(s?.display_name || '').trim(),
      lineCount: Number.isFinite(s?.lineCount) ? s.lineCount : 0,
    }))
    .filter((s) => /^[a-z0-9][a-z0-9_-]{1,60}$/i.test(s.id));
}

async function aoAuthContext() {
  const token = await waitForImsToken();
  if (!token) return null;
  const profile = await window.adobeIMS?.getProfile();
  return {
    token,
    orgId: getImsOrgId(profile?.projectedProductContext),
    userId: profile?.userId,
    base: AO_HTTP_BASE[aoEnv()] || AO_HTTP_BASE.stage,
  };
}

export async function fetchSkillsFromAo() {
  const ctx = await aoAuthContext();
  if (!ctx) return null;
  try {
    const resp = await fetch(`${ctx.base}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`, {
      headers: {
        authorization: `Bearer ${ctx.token}`,
        'x-tenant-id': ctx.orgId,
      },
    });
    if (!resp.ok) return null;
    return parseAoSkillsResponse(await resp.json());
  } catch {
    return null;
  }
}

/**
 * Reads a file out of a skill's directory via AO — mirrors Coworker's own
 * "view SKILL.md" call (GET /api/v1/skills/{skill_name}/files?path=...&manifest_id=...),
 * confirmed against aep-ai's read_skill_file handler. Returns the raw file
 * text (frontmatter included) or null on any failure.
 */
export async function fetchSkillFileFromAo(skillName, path = 'SKILL.md') {
  const ctx = await aoAuthContext();
  if (!ctx) return null;
  try {
    const url = `${ctx.base}/api/v1/skills/${encodeURIComponent(skillName)}/files`
      + `?path=${encodeURIComponent(path)}&manifest_id=${AO_MANIFEST_ID}`;
    const resp = await fetch(url, {
      headers: {
        authorization: `Bearer ${ctx.token}`,
        'x-tenant-id': ctx.orgId,
      },
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    return typeof json?.content === 'string' ? json.content : null;
  } catch {
    return null;
  }
}

/**
 * Deletes a personal ("owner"-scope) skill via AO's per-user override API —
 * mirrors aep-ai's reference web client (services/web/hooks/use-user-overrides.ts
 * disableSkill): POST /api/v1/overrides/user/skills/{name}/disable removes the
 * skill from this user's installed sources going forward. Only meaningful for
 * scope: "owner" skills — application/tenant/platform-scope skills aren't
 * owned by the caller and have no personal override to write.
 */
export async function disablePersonalSkillOverride(id) {
  const ctx = await aoAuthContext();
  if (!ctx) return { ok: false, error: 'Not signed in' };
  try {
    const resp = await fetch(
      `${ctx.base}/api/v1/overrides/user/skills/${encodeURIComponent(id)}/disable`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${ctx.token}`,
          'x-tenant-id': ctx.orgId,
          'x-user-id': ctx.userId || '',
        },
      },
    );
    if (!resp.ok) return { ok: false, error: `Delete failed (${resp.status})` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

/**
 * Extends loadSkillsWithStatuses' { map, statuses } shape with AO-only fields:
 * `scopes` ("owner" | "application" | ... — identifies personal skills),
 * `descriptions`, `displayNames`, and `lineCounts`. The id list comes from
 * AO's catalog; falls back to the plain DA-only shape (empty AO fields) if AO
 * is unreachable. Content/status still come from the config sheet only — no
 * .da/skills/*.md reads.
 */
export async function loadSkillsFromAo(org, site, loadedConfig = null) {
  const [aoSkills, daResult] = await Promise.all([
    fetchSkillsFromAo(),
    loadSkillsWithStatuses(org, site, loadedConfig, { includeMdFiles: false }),
  ]);
  if (!aoSkills) {
    return {
      ...daResult, scopes: {}, descriptions: {}, displayNames: {}, lineCounts: {},
    };
  }

  const map = {};
  const statuses = {};
  const scopes = {};
  const descriptions = {};
  const displayNames = {};
  const lineCounts = {};
  aoSkills.forEach(({ id, scope, description, displayName, lineCount }) => {
    map[id] = daResult.map[id] || '';
    statuses[id] = daResult.statuses[id] || 'approved';
    scopes[id] = scope;
    descriptions[id] = description;
    displayNames[id] = displayName || id;
    lineCounts[id] = lineCount;
  });
  return { map, statuses, scopes, descriptions, displayNames, lineCounts };
}

export const AO_SCOPE_PERSONAL = 'owner';

function skillKeyMatch(id) {
  return (r) => normaliseRowKey(r) === id;
}

/**
 * Bidirectional sync between .da/skills/*.md files and the config `skills` sheet.
 *
 * 1. .md orphans (file exists, no config row) → back-fill config entry
 * 2. Config orphans (config row exists, no .md file) → write .md file
 *
 * This guarantees that every skill is visible to both the editor (reads .md)
 * and the agent/slash commands (reads config sheet).
 *
 * @returns {Promise<{ configBackfilled: string[], filesWritten: string[] }>}
 */
export async function syncOrphanSkillsToConfig(org, site) {
  const [fileMap, loaded] = await Promise.all([
    loadSkillsFromMdFiles(org, site),
    fetchDaConfigSheets(org, site),
  ]);
  if (!loaded.ok) return { configBackfilled: [], filesWritten: [] };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg[SKILLS_SHEET]) cfg[SKILLS_SHEET] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[SKILLS_SHEET];
  const data = [...(sheet.data || [])];

  const configKeys = new Set(
    data.map((r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '')),
  );
  const fileKeys = new Set(Object.keys(fileMap));

  // 1. .md files missing from config → add config rows (skip recently deleted)
  const configBackfilled = [...fileKeys].filter(
    (k) => k && !configKeys.has(k) && !isSkillRecentlyDeleted(k),
  );

  // 2. Config rows missing .md files → write files
  const configOnlyIds = [...configKeys].filter((k) => k && !fileKeys.has(k));
  const configOnlyRows = configOnlyIds.map((id) => {
    const row = data.find(
      (r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '') === id,
    );
    return row ? { id, body: String(row.content ?? row.value ?? row.body ?? '') } : null;
  }).filter((e) => e && e.body.trim());

  // Back-fill config sheet
  if (configBackfilled.length) {
    configBackfilled.forEach((id) => {
      data.push({ key: id, content: fileMap[id], status: 'approved' });
    });
    cfg[SKILLS_SHEET] = { ...sheet, data, total: data.length };
    await saveDaConfig(org, site, cfg);
    invalidateConfigCache(org, site);
  }

  // Write missing .md files (fire-and-forget, don't block load)
  const filesWritten = [];
  await Promise.all(configOnlyRows.map(async ({ id, body }) => {
    // eslint-disable-next-line no-use-before-define
    const result = await writeSkillMdFile(org, site, id, body);
    if (result.ok) filesWritten.push(id);
  }));

  if (filesWritten.length) invalidateSkillMdCache(org, site);

  return { configBackfilled, filesWritten };
}

export async function upsertSkillInConfig(org, site, skillId, content, options = {}) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid skill id' };
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : undefined;
  return upsertSheetRow(
    org,
    site,
    SKILLS_SHEET,
    skillKeyMatch(id),
    (prev) => ({
      ...prev,
      key: id,
      content,
      status: nextStatus ?? skillRowStatus(prev),
    }),
    'Skill',
  );
}

export async function deleteSkillFromConfig(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid skill id' };
  markSkillDeleted(id);
  return deleteSheetRow(org, site, SKILLS_SHEET, skillKeyMatch(id), 'Skill');
}

/** Write skill markdown to .da/skills/{id}.md via DA Admin source API. */
export async function writeSkillMdFile(org, site, skillId, markdown) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid skill id' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const body = new FormData();
  body.append('data', blob, `${id}.md`);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'PUT', body });
    if (resp.ok) invalidateSkillMdCache(org, site);
    return { ok: resp.ok, status: resp.status };
  } catch {
    return { ok: false, error: 'Network error writing skill file' };
  }
}

/** Read skill markdown from .da/skills/{id}.md. */
export async function readSkillMdFile(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id || !isSafeId(id)) return { text: '' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (!resp.ok) return { text: '' };
    return { text: await resp.text() };
  } catch { return { text: '' }; }
}

/** Delete skill .md file from .da/skills/{id}.md. */
export async function deleteSkillMdFile(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid skill id' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
    // 404 means the file never existed — treat as success so callers don't error
    const ok = resp.ok || resp.status === 404;
    if (ok) invalidateSkillMdCache(org, site);
    return { ok, status: resp.status };
  } catch {
    return { ok: false, error: 'Network error deleting skill file' };
  }
}

// ─── prompts CRUD ───────────────────────────────────────────────────────────

const PROMPTS_SHEET = 'prompts';

export async function upsertPromptInConfig(org, site, row, options = {}) {
  const title = String(row.title || '').trim();
  const promptText = String(row.prompt || '').trim();
  if (!title || !promptText) return { ok: false, error: 'Title and prompt are required' };

  const matchTitle = String(options.originalTitle ?? title).trim();
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : undefined;

  return upsertSheetRow(
    org,
    site,
    PROMPTS_SHEET,
    (r) => String(r.title ?? '').trim() === matchTitle,
    (prev) => ({
      ...prev,
      title,
      prompt: promptText,
      category: row.category !== undefined ? row.category : (prev.category ?? ''),
      icon: row.icon !== undefined ? row.icon : (prev.icon ?? ''),
      status: nextStatus ?? skillRowStatus(prev),
    }),
    'Prompt',
  );
}

export async function deletePromptFromConfig(org, site, title) {
  const titleStr = String(title || '').trim();
  if (!titleStr) return { ok: false, error: 'Title required' };
  return deleteSheetRow(
    org,
    site,
    PROMPTS_SHEET,
    (r) => String(r.title ?? '').trim() === titleStr,
    'Prompt',
  );
}

// ─── tool overrides ─────────────────────────────────────────────────────────

export async function setToolOverride(org, site, serverId, toolName, enabled) {
  const key = `${serverId}/${toolName}`;
  return upsertSheetRow(
    org,
    site,
    TOOL_OVERRIDES_SHEET,
    (r) => String(r.key || '').trim() === key,
    (prev) => ({ ...prev, key, server: serverId, tool: toolName, enabled: !!enabled }),
    'Tool override',
  );
}

export async function deleteToolOverride(org, site, serverId, toolName) {
  const key = `${serverId}/${toolName}`;
  return deleteSheetRow(
    org,
    site,
    TOOL_OVERRIDES_SHEET,
    (r) => String(r.key || '').trim() === key,
    'Tool override',
  );
}

// ─── MCP header helpers ─────────────────────────────────────────────────────

const SENSITIVE_HEADER_RE = /^(authorization|x-api-key|x-auth|x-token|cookie|proxy-authorization|x-csrf|x-xsrf)/i;

/**
 * Return true when a header name is likely to carry a secret value
 * (auth tokens, API keys, cookies, CSRF tokens).
 */
export function isSensitiveHeaderName(name) {
  return SENSITIVE_HEADER_RE.test(String(name || '').trim());
}

/**
 * Read headers from a config row, supporting both the new `headers` array
 * and legacy `authHeaderName`/`authHeaderValue` single-pair columns.
 * @returns {Record<string, string>}
 */
function parseRowHeaders(row) {
  const out = {};
  if (Array.isArray(row?.headers)) {
    row.headers.forEach((h) => {
      const n = String(h?.name || '').trim();
      const v = String(h?.value || '').trim();
      if (n && v) out[n] = v;
    });
  }
  // Legacy single-header fallback (only if `headers` array didn't already cover it)
  const legacyName = String(row?.authHeaderName || '').trim();
  const legacyValue = String(row?.authHeaderValue || '').trim();
  if (legacyName && legacyValue && !(legacyName in out)) {
    out[legacyName] = legacyValue;
  }
  return out;
}

/**
 * Read headers from a config row as a `[{ name, value }]` array for the editor form.
 */
export function rowHeadersToArray(row) {
  const map = parseRowHeaders(row);
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

// ─── MCP servers ────────────────────────────────────────────────────────────

const MCP_SHEET = 'mcp-servers';

function mcpKeyMatch(serverKey) {
  return (r) => normaliseRowKey(r) === serverKey;
}

export async function registerMcpServer(
  org,
  site,
  key,
  url,
  description = '',
  headers = [],
) {
  const serverKey = String(key || '').trim();
  const serverUrl = String(url || '').trim();
  if (!serverKey || !serverUrl) return { ok: false, error: 'Key and URL required' };
  const safeHeaders = (Array.isArray(headers) ? headers : [])
    .map((h) => ({
      name: String(h?.name || '').trim(),
      value: String(h?.value || '').trim(),
    }))
    .filter((h) => h.name && h.value);
  return upsertSheetRow(
    org,
    site,
    MCP_SHEET,
    mcpKeyMatch(serverKey),
    (prev) => {
      const row = { ...prev, key: serverKey, url: serverUrl };
      if (description) row.description = String(description).trim();
      if (safeHeaders.length) row.headers = safeHeaders;
      else delete row.headers;
      delete row.authHeaderName;
      delete row.authHeaderValue;
      return row;
    },
    'MCP server',
  );
}

export async function setMcpServerEnabled(org, site, key, enabled) {
  const serverKey = String(key || '').trim();
  if (!serverKey) return { ok: false, error: 'Server id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { ok: false, error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[MCP_SHEET];
  if (!sheet?.data?.length) return { ok: false, error: 'No MCP servers' };

  const data = [...sheet.data];
  const idx = data.findIndex(mcpKeyMatch(serverKey));
  if (idx < 0) return { ok: false, error: 'Server not found' };
  data[idx] = { ...data[idx], enabled: !!enabled };
  cfg[MCP_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { ok: true } : { ok: false, error: `Save failed (${save.status})` };
}

export async function deleteMcpServer(org, site, key) {
  const serverKey = String(key || '').trim();
  if (!serverKey) return { ok: false, error: 'Key required' };
  return deleteSheetRow(org, site, MCP_SHEET, mcpKeyMatch(serverKey), 'MCP server');
}

export async function fetchMcpToolsFromAgent(servers, serverHeaders = {}) {
  if (!Object.keys(servers || {}).length) return { servers: [] };
  try {
    const payload = { servers, serverHeaders };
    const token = getToken();
    if (token) payload.imsToken = token;

    const resp = await fetch(`${getAgentOrigin()}/mcp-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok ? resp.json() : null;
  } catch { return null; }
}

// ─── agent presets ──────────────────────────────────────────────────────────

const AGENTS_PATH = '.da/agents';

export async function loadAgentPresets(org, site) {
  const out = [];
  try {
    const listResp = await daFetch(`${DA_ORIGIN}/list/${org}/${site}/${AGENTS_PATH}`);
    if (!listResp.ok) return out;
    const json = await listResp.json().catch(() => null);
    if (!Array.isArray(json)) return out;
    const jsonFiles = json.filter((item) => item.ext === 'json' || (item.name || '').endsWith('.json'));
    await Promise.all(jsonFiles.map(async (item) => {
      const id = (item.name || '').replace(/\.json$/i, '');
      if (!id) return;
      try {
        const src = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (!src.ok) return;
        const preset = JSON.parse(await src.text());
        if (preset && typeof preset === 'object') {
          out.push({
            id,
            preset,
            ...preset,
          });
        }
      } catch { /* skip */ }
    }));
  } catch { /* noop */ }
  return out;
}

export async function saveAgentPresetFile(org, site, agentId, preset) {
  const id = String(agentId || '').trim().replace(/\.json$/i, '');
  if (!id) return { ok: false, error: 'Agent id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid agent id' };
  const path = `/${org}/${site}/${AGENTS_PATH}/${id}.json`;
  const body = new FormData();
  body.append(
    'data',
    new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }),
    `${id}.json`,
  );
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'POST', body });
    return resp.ok ? { ok: true, status: resp.status } : { ok: false, error: `Save failed (${resp.status})` };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function deleteAgentPresetFile(org, site, agentId) {
  const id = String(agentId || '').trim().replace(/\.json$/i, '');
  if (!id) return { ok: false, error: 'Agent id required' };
  if (!isSafeId(id)) return { ok: false, error: 'Invalid agent id' };
  const path = `/${org}/${site}/${AGENTS_PATH}/${id}.json`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
    const ok = resp.ok || resp.status === 404;
    return ok ? { ok: true } : { ok: false, error: `Delete failed (${resp.status})` };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

// ─── utilities ──────────────────────────────────────────────────────────────

export { extractToolRefs } from './utils/markdown.js';

/**
 * Parses an `x-da-actions` header value and returns whether `write` is granted.
 * Header format: `/path=perm1,perm2` (multiple entries may be whitespace/semicolon-separated).
 *
 * @param {string} actionsHeader
 * @returns {boolean}
 */
export function parseActionsHasWrite(actionsHeader) {
  return String(actionsHeader || '').split(/[\s;]+/).some((entry) => {
    const eqIdx = entry.indexOf('=');
    if (eqIdx === -1) return false;
    return entry.slice(eqIdx + 1).split(',').some((p) => p.trim() === 'write');
  });
}

/**
 * Returns true if the current user has write permission on the skills folder,
 * false only when the server returns a definitive x-da-actions header without write.
 * Defaults to true on missing header, non-2xx response, or network error.
 *
 * @param {string} org
 * @param {string} site
 * @returns {Promise<boolean>}
 */
export async function fetchSkillsPermission(org, site) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}/.da/skills/`, { method: 'HEAD' });
    if (!resp.ok) return true; // non-2xx: optimistic, header won't be reliable
    const actions = resp.headers?.get('x-da-actions') || '';
    if (!actions) return true;
    return parseActionsHasWrite(actions);
  } catch {
    return true;
  }
}

/**
 * Fetch site source text by path under site (e.g. /drafts/page.html).
 * Used by the memory tab to load/display the agent memory file.
 */
export async function fetchSiteSourceText(org, site, pathUnderSite) {
  const p = String(pathUnderSite || '').replace(/^\//, '');
  if (!p) return { error: 'Path required' };
  if (!isSafeSubPath(p)) return { error: 'Invalid path' };
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}/${p}`);
    if (resp.status === 404) return { text: '' };
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return { text: await resp.text() };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}
