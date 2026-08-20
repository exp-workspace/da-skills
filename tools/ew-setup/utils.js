export function parseOrgSite(raw) {
  const normalized = (raw || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { org: parts[0], site: parts[1] };
}

export function hasEwEnabled(json) {
  if (!json) return false;
  const flagRows = json.flags?.data;
  if (!Array.isArray(flagRows)) return false;
  return flagRows.some((r) => r.key === 'ew.enabled' && String(r.value).toLowerCase() === 'true');
}

export function buildConfigWithEwEnabled(existingJson) {
  const newRow = { key: 'ew.enabled', value: 'true' };
  if (!existingJson) return { flags: { data: [newRow] } };
  const flagsExisted = !!existingJson.flags;
  const existingFlags = Array.isArray(existingJson.flags?.data) ? existingJson.flags.data : [];
  const filtered = existingFlags.filter((r) => r.key !== 'ew.enabled');
  const updatedFlags = { ...(existingJson.flags ?? {}), data: [...filtered, newRow] };
  const result = { ...existingJson, flags: updatedFlags };
  if (!flagsExisted && Array.isArray(existingJson[':names'])) {
    result[':names'] = [...existingJson[':names'], 'flags'];
  }
  return result;
}

const SIDEKICK_EDIT_URL = 'https://da.live/canvas#/{{org}}/{{site}}{{pathname}}';

export function hasCorrectSidekickConfig(json) {
  return json?.editUrlPattern === SIDEKICK_EDIT_URL;
}

export function buildUpdatedSidekickConfig(existingJson) {
  if (!existingJson) return { project: 'Experience Workspace Project', editUrlPattern: SIDEKICK_EDIT_URL };
  return { ...existingJson, editUrlPattern: SIDEKICK_EDIT_URL };
}
