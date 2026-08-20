/** Canonical tab ID strings — use these instead of bare string literals. */
const TAB_SKILLS = 'skills';
const TAB_AGENTS = 'agents'; // UI label: "Plugins"
const TAB_PROMPTS = 'prompts';
const TAB_MCPS = 'mcps';
const TAB_MARKETPLACE = 'marketplace';
const TAB_MEMORY = 'memory';
const TAB_CONTEXT = 'context'; // UI label: "Enterprise Context"; embeds the Experience Governance MFE

/** Per-tab metadata rendered by the catalog tab strip. */
const CATALOG_TABS = [
  { id: TAB_PROMPTS, label: 'Prompts' },
  { id: TAB_AGENTS, label: 'Plugins' },
  { id: TAB_SKILLS, label: 'Skills' },
  { id: TAB_MCPS, label: 'MCPs' },
  // { id: TAB_MARKETPLACE, label: 'Marketplace', disabled: true },
  { id: TAB_MEMORY, label: 'Memory' },
  { id: TAB_CONTEXT, label: 'Enterprise Context' },
];

const TAB_LABEL_MAP = Object.fromEntries(CATALOG_TABS.map((t) => [t.id, t.label]));

const TAB_DESCRIPTIONS = {
  [TAB_PROMPTS]: 'Reusable prompt templates you can send to the assistant.',
  [TAB_AGENTS]: 'Agent presets with bundled skills and MCP server access.',
  [TAB_SKILLS]: 'Markdown instructions that guide the assistant\'s behavior.',
  [TAB_MCPS]: 'Model Context Protocol servers that give the assistant access to external tools.',
  [TAB_MARKETPLACE]: 'Discover and install 1st and 3rd party plugins.',
  [TAB_CONTEXT]: 'Brand governance context and enterprise content checks.',
};

/** Per-tab metadata for the "new" button label and the opener method name. */
const TAB_ACTIONS = {
  [TAB_SKILLS]: { btnLabel: '+ New Skill', opener: 'openNewSkillEditor', canWriteKey: 'canWrite' },
  [TAB_AGENTS]: { btnLabel: 'Browse Marketplace', disabled: true, icon: 'storefront' },
  [TAB_PROMPTS]: { btnLabel: '+ New Prompt', opener: 'openNewEditor' },
  [TAB_MCPS]: { btnLabel: '+ Register MCP', opener: 'openNewMcpEditor' },
};

const CATEGORY_OPTIONS = ['Review', 'Workflow', 'Style', 'Content'];

const KNOWN_CATEGORY_CLASSES = new Set(['review', 'workflow', 'style', 'content']);

const STATUS = { APPROVED: 'approved', DRAFT: 'draft' };

const STATUS_TYPE = { OK: 'ok', WARN: 'warn', ERR: 'err' };

/**
 * Canonical shape for all form fields across skill/prompt/MCP modes.
 * Adding a new field? Add it here so _captureForm / _restoreForm pick it up automatically.
 */
const FRESH_FORM_STATE = Object.freeze({
  formSkillId: '',
  formSkillBody: '',
  isFormEdit: false,
  isAgentViewTools: false,
  formPromptTitle: '',
  formPromptBody: '',
  formPromptCategory: '',
  formPromptIcon: '',
  formPromptOriginalTitle: '',
  isFormPromptEdit: false,
  formPromptTools: [],
  mcpKey: '',
  mcpUrl: '',
  mcpDescription: '',
  mcpHeaders: [],
  editingMcpKey: null,
  viewingMcpServerId: null,
  newAgentId: '',
  newAgentName: '',
});

const BUILTIN_MCP_SERVERS = [
  {
    id: 'da-tools',
    description: 'Core DA authoring tools — read, write, list, copy, and manage content',
    transport: 'built-in',
  },
  {
    id: 'eds-preview',
    description: 'Preview and publish content to Edge Delivery Services',
    transport: 'built-in',
  },
];

const BUILTIN_AGENTS = [
  {
    id: 'da-assistant',
    label: 'DA Assistant',
    description: 'Default content authoring assistant with full DA tooling',
    mcpServers: ['da-tools', 'eds-preview'],
  },
];

const BUILTIN_TOOL_DETAILS = {
  'da-tools': [
    { name: 'content_list', description: 'List files and directories at a path' },
    { name: 'content_read', description: 'Read file content and metadata' },
    { name: 'content_create', description: 'Create a new source file' },
    { name: 'content_update', description: 'Update an existing source file' },
    { name: 'content_delete', description: 'Delete a source file' },
    { name: 'content_copy', description: 'Copy content to another location' },
    { name: 'content_move', description: 'Move content to another location' },
    { name: 'content_version_create', description: 'Snapshot the current state of a file' },
    { name: 'content_version_list', description: 'Get version history for a file' },
    { name: 'content_media', description: 'Lookup media references and URLs' },
    { name: 'content_fragment', description: 'Lookup content fragment references' },
    { name: 'content_upload', description: 'Upload an image or media file' },
    { name: 'da_get_skill', description: 'Read a skill by ID' },
    { name: 'da_create_skill', description: 'Create or update a skill' },
    { name: 'da_list_agents', description: 'List available agent presets' },
    { name: 'da_create_agent', description: 'Create or update an agent preset' },
    { name: 'da_embed_fragment', description: 'Embed a web fragment into a page' },
    { name: 'write_project_memory', description: 'Write to long-lived project memory' },
  ],
  'eds-preview': [
    { name: 'content_preview', description: 'Preview a page on EDS preview environment' },
    { name: 'content_publish', description: 'Publish a page to EDS live environment' },
    { name: 'content_unpreview', description: 'Remove a page from EDS preview' },
    { name: 'content_unpublish', description: 'Unpublish a page from EDS live' },
  ],
};

const BUILTIN_TOOL_IDS = Object.values(BUILTIN_TOOL_DETAILS).flat().map((t) => t.name);

const DEP_TREE_MAX_TOOLS = 6;
const TOOLS_FILTER_THRESHOLD = 6;
const CHAT_DRAWER_WIDTH = 380;
const AGENT_USAGE_ICON = '\u26A1';

/**
 * Experience Governance MFE embed config. SPA Pipeline serves the built bundle
 * at this same fixed path on every environment, and only the host changes. See
 * utils/egov-embed.js for how EMBED_URLS is picked at runtime.
 */
const EGOV_EMBED_PATH = '/solutions/Adobe-AEM-Foundation-experience-governance-mfe/static-assets/resources/embed.html';

const EGOV_MFE = {
  CHANNEL: '@aemsec/experience-governance-mfe',
  PROTOCOL: '@assets/microfrontend/MessageRpc',
  VERSION: '1.0.0',
  EMBED_URLS: {
    local: `https://localhost.corp.adobe.com:8443${EGOV_EMBED_PATH}`,
    qa: `https://experience-qa.adobe.com${EGOV_EMBED_PATH}`,
    stage: `https://experience-stage.adobe.com${EGOV_EMBED_PATH}`,
    prod: `https://experience.adobe.com${EGOV_EMBED_PATH}`,
  },
};

export {
  AGENT_USAGE_ICON,
  BUILTIN_AGENTS,
  BUILTIN_MCP_SERVERS,
  BUILTIN_TOOL_DETAILS,
  BUILTIN_TOOL_IDS,
  CATALOG_TABS,
  CATEGORY_OPTIONS,
  CHAT_DRAWER_WIDTH,
  DEP_TREE_MAX_TOOLS,
  EGOV_MFE,
  TAB_DESCRIPTIONS,
  TAB_LABEL_MAP,
  FRESH_FORM_STATE,
  KNOWN_CATEGORY_CLASSES,
  STATUS,
  STATUS_TYPE,
  TAB_ACTIONS,
  TAB_AGENTS,
  TAB_CONTEXT,
  TAB_MARKETPLACE,
  TAB_MCPS,
  TAB_MEMORY,
  TAB_PROMPTS,
  TAB_SKILLS,
  TOOLS_FILTER_THRESHOLD,
};
