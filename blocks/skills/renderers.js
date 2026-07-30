import { html, nothing } from 'da-lit';
import { extractTitle } from './utils/markdown.js';
import { parseFrontmatter } from './utils/skill-frontmatter.js';
import {
  BUILTIN_AGENTS,
  BUILTIN_MCP_SERVERS,
  BUILTIN_TOOL_DETAILS,
  BUILTIN_TOOL_IDS,
  CATALOG_TABS,
  CATEGORY_OPTIONS,
  KNOWN_CATEGORY_CLASSES,
  STATUS,
  STATUS_TYPE,
  TAB_ACTIONS,
  TAB_AGENTS,
  TAB_DESCRIPTIONS,
  TAB_LABEL_MAP,
  TAB_MARKETPLACE,
  TAB_MCPS,
  TAB_MEMORY,
  TAB_PROMPTS,
  TAB_SKILLS,
} from './constants.js';
import {
  isSensitiveHeaderName,
  skillRowEnabled,
  skillRowStatus,
  AO_SCOPE_PERSONAL,
  DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT,
} from './skills-editor-api.js';

// ─── tab icon SVGs ────────────────────────────────────────────────────────────
// Official EW icons (20 × 20 viewBox, fill-based) for tabs that have them;
// lightweight stroke placeholders for Prompts.

/* eslint-disable max-len */
const TAB_ICON_MAP = {
  [TAB_PROMPTS]: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3-7.5 7.5H3V10z"/></svg>`,
  [TAB_AGENTS]: html`<svg viewBox="0 0 20 20" fill="none"><path d="M13.5947 1.80957C13.8876 1.51668 14.3624 1.51668 14.6553 1.80957C14.948 2.10248 14.9481 2.57728 14.6553 2.87012L11.6494 5.875L14.124 8.34961L17.1299 5.34473C17.4228 5.05201 17.8976 5.0519 18.1904 5.34473C18.4833 5.63756 18.4831 6.11237 18.1904 6.40527L15.1846 9.41016L15.833 10.0586C16.1298 10.3555 16.2969 10.7589 16.2969 11.1787C16.2968 11.5984 16.1297 12.001 15.833 12.2979L13.4756 14.6553C12.7099 15.4208 11.6716 15.8506 10.5889 15.8506C9.50611 15.8506 8.46788 15.4208 7.70215 14.6553L7.05371 14.0068L4.6377 16.4229C4.34482 16.7155 3.86997 16.7155 3.57715 16.4229C3.28433 16.13 3.28449 15.6552 3.57715 15.3623L5.99316 12.9463L5.34473 12.2979C4.57921 11.5322 4.14954 10.4938 4.14941 9.41113C4.14941 8.32827 4.5791 7.28919 5.34473 6.52344L7.70215 4.16602C7.99904 3.86936 8.40157 3.70312 8.82129 3.70312C9.24103 3.70317 9.64356 3.86929 9.94043 4.16602L10.5889 4.81445L13.5947 1.80957ZM8.82129 5.20215C8.7994 5.20215 8.77828 5.21121 8.7627 5.22656L6.40527 7.58398C5.92095 8.06843 5.64844 8.7261 5.64844 9.41113C5.64856 10.096 5.92106 10.753 6.40527 11.2373L8.7627 13.5947C9.24712 14.0789 9.90393 14.3506 10.5889 14.3506C11.2738 14.3506 11.9306 14.0789 12.415 13.5947L14.7725 11.2373C14.7879 11.2218 14.7968 11.2006 14.7969 11.1787C14.7969 11.1567 14.7879 11.1357 14.7725 11.1201L8.87988 5.22656C8.86432 5.21114 8.8432 5.20219 8.82129 5.20215Z" fill="currentColor"/></svg>`,
  [TAB_SKILLS]: html`<svg viewBox="0 0 20 20" fill="none"><g clip-path="url(#ew-skill)"><path d="M17.583 9.99963C17.5829 9.83408 17.5506 9.67016 17.4873 9.51721C17.4239 9.36417 17.331 9.22517 17.2138 9.10803L15.8115 7.70667C15.6123 7.50764 15.4696 7.25844 15.3984 6.98596C15.3274 6.71375 15.3309 6.42763 15.4072 6.15686C15.4837 5.88587 15.6309 5.64003 15.834 5.44495C16.0369 5.24999 16.2878 5.11211 16.5615 5.04651C16.7919 4.99123 17.0039 4.87576 17.1748 4.71155C17.3457 4.54731 17.4698 4.34004 17.5341 4.11194C17.5984 3.88396 17.6007 3.64291 17.541 3.4137C17.4812 3.18435 17.3609 2.97487 17.1933 2.80725C17.0258 2.63979 16.817 2.51946 16.5879 2.45959C16.3585 2.39971 16.1168 2.40213 15.8886 2.46643C15.6607 2.53074 15.4542 2.6551 15.29 2.82581C15.1669 2.95384 15.0704 3.10457 15.0068 3.26917L14.9541 3.43811C14.8885 3.71189 14.7517 3.96361 14.5566 4.16663C14.3616 4.36965 14.1157 4.51691 13.8447 4.59338C13.5737 4.66985 13.2871 4.67233 13.0146 4.6012C12.7422 4.53005 12.4939 4.3873 12.2949 4.18811V4.18909L10.8925 2.78577C10.7754 2.66861 10.6355 2.57573 10.4824 2.51233C10.3295 2.44906 10.1655 2.41663 9.99997 2.41663C9.83445 2.41663 9.67049 2.44904 9.51755 2.51233C9.36447 2.57574 9.22455 2.6686 9.10739 2.78577V2.78674L7.70505 4.18811C7.69457 4.19858 7.68731 4.21186 7.68356 4.2262C7.67985 4.24051 7.67955 4.25591 7.68356 4.27014C7.6876 4.28424 7.69546 4.29708 7.70602 4.30725C7.71658 4.31739 7.7299 4.32426 7.74411 4.32776H7.74509C8.23484 4.44524 8.6847 4.69165 9.04782 5.04065C9.41083 5.38962 9.67375 5.82947 9.81052 6.31409C9.94727 6.79876 9.95321 7.31116 9.82614 7.79846C9.69906 8.2858 9.44393 8.73036 9.08786 9.08655C8.73179 9.44274 8.28708 9.69759 7.79977 9.82483C7.3125 9.95205 6.80012 9.94681 6.3154 9.81018C5.83068 9.67354 5.39107 9.41045 5.04196 9.04749C4.73656 8.72994 4.50958 8.34631 4.37888 7.92737L4.32907 7.74475C4.32562 7.73034 4.31785 7.71735 4.30759 7.70667C4.29733 7.69599 4.28472 7.68823 4.27048 7.6842C4.25621 7.68018 4.24087 7.67948 4.22653 7.68323C4.21249 7.68694 4.19976 7.69451 4.18942 7.70471L2.7861 9.10803C2.66899 9.22517 2.57605 9.36418 2.51267 9.51721C2.44931 9.67016 2.41701 9.83408 2.41696 9.99963C2.41696 10.1653 2.44926 10.33 2.51267 10.483C2.57607 10.636 2.66899 10.7751 2.7861 10.8922L4.18845 12.2936L4.32712 12.4518C4.4545 12.6183 4.54816 12.8091 4.60153 13.0133C4.67266 13.2856 4.67008 13.5725 4.59372 13.8434C4.51725 14.1144 4.36907 14.3602 4.16599 14.5553C3.96291 14.7504 3.71133 14.8872 3.43747 14.9528C3.20724 15.0081 2.99589 15.1246 2.82517 15.2887C2.65433 15.4529 2.53015 15.6602 2.46579 15.8883C2.40154 16.1163 2.39919 16.3574 2.45895 16.5865C2.51876 16.8159 2.63905 17.0254 2.80661 17.193C2.97402 17.3604 3.18306 17.4798 3.41208 17.5397C3.6414 17.5996 3.88317 17.5981 4.1113 17.5338C4.33926 17.4695 4.54571 17.3451 4.70993 17.1744C4.87423 17.0036 4.99051 16.7916 5.04587 16.5612C5.1115 16.2877 5.24852 16.0364 5.44333 15.8336C5.63836 15.6306 5.88432 15.4834 6.15524 15.4069C6.42623 15.3304 6.71289 15.3279 6.98532 15.399C7.25778 15.4702 7.507 15.6119 7.70602 15.8112L9.10739 17.2135C9.22455 17.3307 9.36447 17.4235 9.51755 17.4869C9.67057 17.5503 9.83435 17.5836 9.99997 17.5836C10.1656 17.5836 10.3294 17.5503 10.4824 17.4869C10.6355 17.4235 10.7754 17.3307 10.8925 17.2135L12.2949 15.8121L12.3164 15.774C12.3201 15.7597 12.3204 15.7444 12.3164 15.7301C12.3124 15.716 12.3045 15.7032 12.2939 15.693C12.2833 15.6828 12.2701 15.675 12.2558 15.6715H12.2549C11.7654 15.554 11.3161 15.3084 10.9531 14.9596C10.59 14.6106 10.3262 14.1709 10.1894 13.6862C10.0526 13.2014 10.0477 12.6891 10.1748 12.2018C10.3018 11.7145 10.5561 11.2698 10.9121 10.9137C11.2681 10.5575 11.7129 10.3027 12.2002 10.1754C12.6875 10.0482 13.1998 10.0534 13.6845 10.1901C14.1693 10.3267 14.6089 10.5898 14.958 10.9528C15.307 11.3157 15.5532 11.7649 15.6709 12.2545V12.2555C15.6743 12.2699 15.6821 12.2829 15.6924 12.2936C15.7026 12.3042 15.7153 12.312 15.7295 12.316C15.7437 12.3201 15.7591 12.3208 15.7734 12.317C15.7877 12.3133 15.8011 12.305 15.8115 12.2946L17.2138 10.8922C17.331 10.7751 17.4239 10.636 17.4873 10.483C17.5507 10.33 17.583 10.1653 17.583 9.99963ZM19.083 9.99963C19.083 10.3623 19.0118 10.7222 18.873 11.0573C18.7342 11.3922 18.5308 11.6964 18.2744 11.9528L16.872 13.3551C16.673 13.5543 16.4247 13.697 16.1523 13.7682C15.8799 13.8393 15.5932 13.8368 15.3222 13.7604C15.0512 13.6839 14.8054 13.5357 14.6103 13.3326C14.4153 13.1296 14.2774 12.8779 14.2119 12.6041V12.6031C14.1563 12.3736 14.0406 12.1631 13.8769 11.9928C13.7126 11.822 13.5054 11.6977 13.2773 11.6334C13.0493 11.5692 12.8083 11.5667 12.5791 11.6266C12.3498 11.6865 12.1402 11.8066 11.9726 11.9742C11.8052 12.1418 11.6857 12.3515 11.6259 12.5807C11.5662 12.8099 11.5684 13.051 11.6328 13.2789C11.6971 13.5069 11.8214 13.7134 11.9922 13.8776C12.163 14.0418 12.375 14.1582 12.6054 14.2135H12.6045C12.8783 14.279 13.1299 14.4159 13.333 14.611C13.536 14.806 13.6833 15.0519 13.7597 15.3229C13.8362 15.5939 13.8387 15.8805 13.7675 16.153C13.6964 16.4252 13.5545 16.6737 13.3554 16.8727L11.9531 18.275L11.9521 18.274C11.6957 18.5304 11.3916 18.7349 11.0566 18.8737C10.7217 19.0123 10.3625 19.0836 9.99997 19.0836C9.63743 19.0836 9.2783 19.0124 8.94333 18.8737C8.60826 18.7349 8.30329 18.5305 8.04684 18.274L6.6445 16.8717C6.63402 16.8612 6.62075 16.854 6.60642 16.8502C6.59209 16.8465 6.57671 16.8462 6.56247 16.8502C6.54837 16.8542 6.53554 16.8621 6.52536 16.8727C6.51509 16.8834 6.5083 16.8973 6.50485 16.9117H6.50388C6.38623 17.4015 6.14011 17.8515 5.79099 18.2145C5.44192 18.5773 5.00212 18.8406 4.51755 18.9772C4.03291 19.1137 3.52035 19.119 3.03317 18.9918C2.54595 18.8646 2.10111 18.6097 1.74509 18.2535C1.38915 17.8975 1.1349 17.4526 1.00778 16.9655C0.880699 16.4781 0.885635 15.9648 1.02243 15.4801C1.15924 14.9956 1.42312 14.5565 1.7861 14.2076C2.14922 13.8586 2.59908 13.6122 3.08884 13.4948L3.12692 13.4742C3.13761 13.464 3.14536 13.4504 3.14938 13.4362C3.15337 13.4219 3.15409 13.4065 3.15036 13.3922C3.14658 13.378 3.1383 13.3655 3.1279 13.3551L1.72556 11.9528C1.4692 11.6964 1.26571 11.3922 1.12692 11.0573C0.988127 10.7222 0.916962 10.3623 0.916962 9.99963C0.917015 9.63709 0.988178 9.27794 1.12692 8.94299C1.26569 8.60805 1.4692 8.30386 1.72556 8.04749L3.1279 6.64514L3.2861 6.50647C3.45268 6.37907 3.64338 6.28542 3.84763 6.23206C4.12003 6.16091 4.40673 6.16346 4.6777 6.23987C4.94861 6.3163 5.19456 6.46369 5.38962 6.66663C5.58466 6.86965 5.72249 7.12136 5.78806 7.39514L5.83981 7.56409C5.90342 7.72872 5.99988 7.87938 6.12302 8.00745C6.28731 8.17827 6.4945 8.30252 6.72263 8.36682C6.95063 8.43103 7.19167 8.43349 7.42087 8.37366C7.65019 8.31378 7.85975 8.19362 8.02731 8.026C8.19479 7.85841 8.31421 7.64882 8.37399 7.41956C8.43374 7.19028 8.4315 6.94934 8.36716 6.72131C8.30278 6.49321 8.17866 6.28594 8.00778 6.1217C7.83704 5.95771 7.62567 5.84203 7.39548 5.78674C7.12168 5.72121 6.87001 5.5843 6.66696 5.38928C6.46396 5.19426 6.3167 4.94827 6.2402 4.67737C6.16375 4.4064 6.16128 4.11971 6.23239 3.84729C6.30354 3.57484 6.4453 3.32561 6.6445 3.12659L8.04684 1.72522C8.30329 1.46876 8.60826 1.26538 8.94333 1.12659C9.27831 0.987867 9.6374 0.916632 9.99997 0.916626C10.3625 0.916626 10.7216 0.987884 11.0566 1.12659C11.3917 1.26537 11.6967 1.46878 11.9531 1.72522L13.3554 3.12756V3.12854C13.3659 3.13901 13.3792 3.14628 13.3935 3.15002C13.4079 3.15377 13.4232 3.15405 13.4375 3.15002C13.4516 3.14602 13.4644 3.13808 13.4746 3.12756C13.4848 3.11688 13.4926 3.10292 13.4961 3.0885L13.5459 2.90686C13.6765 2.48766 13.9034 2.10348 14.209 1.78577C14.558 1.4229 14.9978 1.15967 15.4824 1.02307C15.9671 0.88651 16.4795 0.881201 16.9668 1.00842C17.454 1.13568 17.8988 1.39055 18.2549 1.7467C18.6108 2.1028 18.8651 2.5476 18.9922 3.03479C19.1192 3.52202 19.1142 4.03456 18.9775 4.51917C18.8407 5.00388 18.577 5.4436 18.2138 5.7926C17.8508 6.1415 17.4017 6.38798 16.9121 6.50549H16.9111C16.8968 6.50894 16.8836 6.51586 16.873 6.526C16.8623 6.53627 16.8546 6.54983 16.8506 6.56409C16.8467 6.57812 16.846 6.59295 16.8496 6.60706C16.8533 6.62139 16.8616 6.63467 16.872 6.64514L18.2744 8.04749L18.457 8.24866C18.6287 8.45802 18.769 8.69192 18.873 8.94299C19.0118 9.27794 19.0829 9.63709 19.083 9.99963Z" fill="currentColor"/></g><defs><clipPath id="ew-skill"><rect width="20" height="20" fill="white"/></clipPath></defs></svg>`,
  [TAB_MCPS]: html`<svg viewBox="0 0 20 20" fill="none"><g clip-path="url(#ew-mcp)"><path d="M16.667 10.917C18.0017 10.917 19.084 11.9993 19.084 13.334V16.667C19.0838 18.0015 18.0016 19.084 16.667 19.084H3.33398C1.99942 19.084 0.91719 18.0015 0.916992 16.667V13.334C0.916992 11.9993 1.9993 10.917 3.33398 10.917H16.667ZM3.33398 12.417C2.82772 12.417 2.41699 12.8277 2.41699 13.334V16.667C2.41719 17.1731 2.82785 17.584 3.33398 17.584H16.667C17.1731 17.584 17.5838 17.1731 17.584 16.667V13.334C17.584 12.8277 17.1733 12.417 16.667 12.417H3.33398ZM5.00879 14.25C5.42279 14.2502 5.75879 14.5859 5.75879 15C5.75879 15.4141 5.42279 15.7498 5.00879 15.75H5C4.58579 15.75 4.25 15.4142 4.25 15C4.25 14.5858 4.58579 14.25 5 14.25H5.00879ZM16.667 0.916992C18.0017 0.916992 19.084 1.9993 19.084 3.33398V6.66699C19.0838 8.00151 18.0016 9.08398 16.667 9.08398H3.33398C1.99942 9.08398 0.91719 8.00151 0.916992 6.66699V3.33398C0.916992 1.9993 1.9993 0.916992 3.33398 0.916992H16.667ZM3.33398 2.41699C2.82772 2.41699 2.41699 2.82772 2.41699 3.33398V6.66699C2.41719 7.17308 2.82785 7.58398 3.33398 7.58398H16.667C17.1731 7.58398 17.5838 7.17308 17.584 6.66699V3.33398C17.584 2.82772 17.1733 2.41699 16.667 2.41699H3.33398ZM5.00879 4.25C5.42279 4.25025 5.75879 4.58594 5.75879 5C5.75879 5.41406 5.42279 5.74975 5.00879 5.75H5C4.58579 5.75 4.25 5.41421 4.25 5C4.25 4.58579 4.58579 4.25 5 4.25H5.00879Z" fill="currentColor"/></g><defs><clipPath id="ew-mcp"><rect width="20" height="20" fill="white"/></clipPath></defs></svg>`,
  [TAB_MARKETPLACE]: html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5V14h12V6.5"/><path d="M1 3h14v3.5H1z"/><path d="M6.5 10h3v4h-3z"/></svg>`,
  [TAB_MEMORY]: html`<svg viewBox="0 0 20 20" fill="none"><g clip-path="url(#ew-mem)"><path d="M6.65918 1.02734C7.1404 0.898469 7.64517 0.882385 8.13379 0.979492C8.62271 1.07675 9.08303 1.2854 9.47852 1.58887C9.67116 1.73671 9.84587 1.90522 10 2.09082C10.154 1.90536 10.329 1.73663 10.5215 1.58887C10.9169 1.28547 11.3774 1.07679 11.8662 0.979492C12.3548 0.882336 12.8596 0.898508 13.3408 1.02734C13.8223 1.15635 14.2678 1.39501 14.6426 1.72363C15.0174 2.05234 15.3122 2.46325 15.5029 2.92383C15.6092 3.18058 15.681 3.44909 15.7188 3.72266C16.1152 3.8856 16.4853 4.10951 16.8135 4.38867C17.2853 4.79007 17.6598 5.29389 17.9082 5.86133C18.1566 6.42864 18.2731 7.04529 18.248 7.66406C18.2308 8.0879 18.1449 8.50501 18 8.90137C18.3235 9.25235 18.5874 9.65761 18.7725 10.1045C19.1163 10.9348 19.1769 11.8555 18.9443 12.7236C18.7117 13.5918 18.1984 14.3591 17.4854 14.9062C17.4627 14.9236 17.438 14.9382 17.415 14.9551C17.4189 15.3498 17.3674 15.744 17.2578 16.125C17.1035 16.6613 16.841 17.1609 16.4863 17.5918C16.1317 18.0226 15.6919 18.3764 15.1953 18.6309C14.6989 18.8851 14.1552 19.0351 13.5986 19.0713C13.0418 19.1074 12.4824 19.0289 11.957 18.8408C11.4319 18.6527 10.9502 18.3587 10.543 17.9775C10.3411 17.7886 10.1589 17.58 10 17.3555C9.84116 17.5799 9.65975 17.7886 9.45801 17.9775C9.0507 18.3589 8.5692 18.6527 8.04395 18.8408C7.51874 19.0289 6.96 19.1073 6.40332 19.0713C5.84655 19.0352 5.30227 18.8852 4.80566 18.6309C4.30904 18.3764 3.86933 18.0226 3.51465 17.5918C3.16 17.161 2.89746 16.6613 2.74316 16.125C2.63361 15.744 2.58114 15.3498 2.58496 14.9551C2.56199 14.9382 2.5373 14.9236 2.51465 14.9062C1.80165 14.3591 1.28835 13.5917 1.05566 12.7236C0.823129 11.8556 0.883709 10.9348 1.22754 10.1045C1.41263 9.65761 1.67546 9.2514 1.99902 8.90039C1.85418 8.50449 1.77012 8.08735 1.75293 7.66406C1.72793 7.04532 1.84443 6.42861 2.09277 5.86133C2.34124 5.29395 2.71572 4.79002 3.1875 4.38867C3.51558 4.10964 3.88506 3.88552 4.28125 3.72266C4.31898 3.44916 4.39085 3.18053 4.49707 2.92383C4.68776 2.46342 4.98282 2.05228 5.35742 1.72363C5.73208 1.3951 6.17788 1.15638 6.65918 1.02734ZM7.8418 2.4502C7.57861 2.39789 7.30606 2.40711 7.04688 2.47656C6.78782 2.54608 6.54736 2.67471 6.3457 2.85156C6.14429 3.02842 5.9854 3.24943 5.88281 3.49707C5.78027 3.74486 5.7364 4.01364 5.75391 4.28125C5.77152 4.54894 5.85025 4.80966 5.98438 5.04199C6.1914 5.40067 6.06861 5.8593 5.70996 6.06641C5.35136 6.27313 4.89262 6.15045 4.68555 5.79199C4.59662 5.63798 4.5213 5.47695 4.45898 5.31152C4.35416 5.37728 4.25392 5.45068 4.15918 5.53125C3.86083 5.7851 3.62396 6.10407 3.4668 6.46289C3.3097 6.82177 3.23614 7.21208 3.25195 7.60352C3.25785 7.74859 3.27575 7.8929 3.30566 8.03418C3.57434 8.02462 3.83973 8.15646 3.9834 8.40527C4.18997 8.76372 4.06709 9.22252 3.70898 9.42969C3.21653 9.71404 2.83088 10.1533 2.61328 10.6787C2.39585 11.204 2.35774 11.7868 2.50488 12.3359C2.65215 12.8849 2.97677 13.3707 3.42773 13.7168C3.87871 14.0626 4.43167 14.2499 5 14.25C5.41393 14.2502 5.74985 14.5861 5.75 15C5.74984 15.414 5.41394 15.7498 5 15.75C4.72035 15.75 4.44354 15.7172 4.17285 15.6611C4.17721 15.6775 4.17988 15.6946 4.18457 15.7109C4.2822 16.0501 4.44852 16.3662 4.67285 16.6387C4.89718 16.9111 5.17521 17.135 5.48926 17.2959C5.8034 17.4568 6.1478 17.5514 6.5 17.5742C6.85221 17.597 7.2058 17.5477 7.53809 17.4287C7.87027 17.3097 8.175 17.1239 8.43262 16.8828C8.69032 16.6415 8.89648 16.3492 9.03711 16.0254C9.17648 15.7043 9.24841 15.3578 9.25 15.0078V10.7236C8.80212 11.1015 8.27906 11.3864 7.70996 11.5527C7.31262 11.6686 6.89652 11.4412 6.78027 11.0439C6.66416 10.6465 6.89266 10.2296 7.29004 10.1133C7.85519 9.94797 8.35175 9.60386 8.70508 9.13281C9.05837 8.66171 9.24955 8.08885 9.25 7.5V4.16699C9.25 3.89864 9.18799 3.63327 9.06934 3.39258C8.95062 3.15201 8.77826 2.94163 8.56543 2.77832C8.35258 2.61503 8.1049 2.50258 7.8418 2.4502ZM12.9531 2.47656C12.6939 2.40715 12.4214 2.39784 12.1582 2.4502C11.8952 2.50262 11.6473 2.6151 11.4346 2.77832C11.2219 2.94159 11.0493 3.15218 10.9307 3.39258C10.8121 3.63319 10.75 3.89876 10.75 4.16699V7.5C10.7505 8.08878 10.9417 8.66174 11.2949 9.13281C11.6482 9.60384 12.1449 9.94792 12.71 10.1133C13.1075 10.2295 13.3359 10.6464 13.2197 11.0439C13.1034 11.4413 12.6874 11.6687 12.29 11.5527C11.7209 11.3863 11.1979 11.1016 10.75 10.7236V14.9834C10.7501 14.9885 10.751 14.9939 10.751 14.999C10.7514 15.3521 10.8242 15.7016 10.9648 16.0254C11.1055 16.3492 11.3107 16.6416 11.5684 16.8828C11.826 17.1239 12.1307 17.3097 12.4629 17.4287C12.7951 17.5476 13.1489 17.597 13.501 17.5742C13.8531 17.5513 14.1976 17.4568 14.5117 17.2959C14.8258 17.135 15.1038 16.9111 15.3281 16.6387C15.5524 16.3661 15.7188 16.0501 15.8164 15.7109C15.8211 15.6946 15.8228 15.6775 15.8271 15.6611C15.5564 15.7172 15.2797 15.75 15 15.75C14.586 15.7499 14.2501 15.414 14.25 15C14.2501 14.586 14.586 14.2502 15 14.25C15.5684 14.25 16.1212 14.0627 16.5723 13.7168C17.0232 13.3707 17.3479 12.885 17.4951 12.3359C17.6423 11.7868 17.6042 11.204 17.3867 10.6787C17.1692 10.1534 16.7843 9.71405 16.292 9.42969C15.9335 9.22258 15.8107 8.76391 16.0176 8.40527C16.1611 8.15688 16.4254 8.02506 16.6934 8.03418C16.7233 7.8928 16.7431 7.7487 16.749 7.60352C16.7648 7.21203 16.6913 6.82181 16.5342 6.46289C16.377 6.10393 16.1403 5.78518 15.8418 5.53125C15.7469 5.4505 15.646 5.37742 15.541 5.31152C15.4787 5.47686 15.4033 5.63806 15.3145 5.79199C15.1072 6.15034 14.6486 6.27344 14.29 6.06641C13.9316 5.85933 13.8089 5.40058 14.0156 5.04199C14.1497 4.80968 14.2285 4.54892 14.2461 4.28125C14.2636 4.01354 14.2198 3.74494 14.1172 3.49707C14.0145 3.24926 13.8559 3.02848 13.6543 2.85156C13.4525 2.67462 13.2123 2.54605 12.9531 2.47656Z" fill="currentColor"/></g><defs><clipPath id="ew-mem"><rect width="20" height="20" fill="white"/></clipPath></defs></svg>`,
};
/* eslint-enable max-len */

const ACTION_ICONS = {
  storefront: html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6.5V14h12V6.5"/><path d="M1 3h14v3.5H1z"/><path d="M6.5 10h3v4h-3z"/></svg>`,
};

// ─── private helpers ──────────────────────────────────────────────────────────

function msgClass(statusType) {
  if (statusType === STATUS_TYPE.ERR) return 'msg-err';
  if (statusType === STATUS_TYPE.WARN) return 'msg-warn';
  return 'msg-ok';
}

function editorTitle(vm, tab) {
  if (tab === TAB_AGENTS && vm.isAgentViewTools) return 'Associated Tools';
  if (tab === TAB_AGENTS) return vm.isFormEdit ? 'Edit Agent' : 'New Agent';
  if (tab === TAB_SKILLS) return vm.isFormEdit ? 'Edit Skill' : 'New Skill';
  if (tab === TAB_PROMPTS) return vm.isFormPromptEdit ? 'Edit Prompt' : 'New Prompt';
  if (tab === TAB_MCPS) {
    if (vm.viewingMcpServerId && !vm.editingMcpKey) return vm.viewingMcpServerId;
    if (vm.editingMcpKey) return `Edit: ${vm.editingMcpKey}`;
    return 'Register MCP Server';
  }
  if (tab === TAB_MEMORY) return 'Project Memory';
  return '';
}

function mcpServerToolData(vm, serverId) {
  const builtinList = BUILTIN_TOOL_DETAILS[serverId];
  if (builtinList) return { tools: builtinList, error: null, source: 'builtin' };

  if (!vm.mcpTools) return { tools: [], error: null, source: 'pending' };

  const server = (vm.mcpTools.servers || []).find((s) => s.id === serverId);
  if (!server) {
    const isConfigured = Boolean(vm.configuredMcpServers?.[serverId]);
    if (!isConfigured) return { tools: [], error: 'Server is disabled or has no URL', source: 'unconfigured' };
    return { tools: [], error: null, source: 'pending' };
  }

  if (server.error) return { tools: [], error: server.error, source: 'error' };
  const tools = (server.tools || []).map((t) => ({
    name: t.name,
    description: t.description || '',
  }));
  return { tools, error: null, source: 'live' };
}

function agentsUsingSkill(vm, skillId) {
  const result = [];
  BUILTIN_AGENTS.forEach((a) => {
    if (a.skills?.includes(skillId)) result.push(a.label || a.id);
  });
  (vm.agents || []).forEach((a) => {
    const skills = a.skills || a.preset?.skills || [];
    if (skills.includes(skillId)) result.push(a.label || a.name || a.id);
  });
  return result;
}

// ─── shared icon constants (used in catalog cards and detail views) ───────────
const DRILL_CHEVRON = html`<svg class="drill-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>`;
const PROMPT_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M2 8h8M2 12h10"/></svg>`;
const PLUGIN_ICON = TAB_ICON_MAP[TAB_AGENTS];
const MCP_ICON = TAB_ICON_MAP[TAB_MCPS];
const SKILL_ICON = TAB_ICON_MAP[TAB_SKILLS];
const GRID_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`;
const LIST_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 3h10M4 8h10M4 13h10M2 3h0M2 8h0M2 13h0"/></svg>`;

function renderViewToggle(vm) {
  const { catalogViewMode: mode } = vm;
  return html`
    <div class="view-toggle" role="radiogroup" aria-label="View mode">
      <button type="button" class="view-toggle-btn ${mode === 'grid' ? 'is-active' : ''}"
        aria-pressed=${mode === 'grid' ? 'true' : 'false'}
        title="Grid view"
        @click=${() => vm.setCatalogViewMode('grid')}
      >${GRID_ICON}</button>
      <button type="button" class="view-toggle-btn ${mode === 'list' ? 'is-active' : ''}"
        aria-pressed=${mode === 'list' ? 'true' : 'false'}
        title="List view"
        @click=${() => vm.setCatalogViewMode('list')}
      >${LIST_ICON}</button>
    </div>
  `;
}

function renderSkillCard(vm, id) {
  const description = vm.skillDescriptions[id] || '';
  const displayName = vm.skillDisplayNames[id] || id;
  const isViewing = vm.viewingSkillId === id;
  const isPersonal = vm.skillScopes[id] === AO_SCOPE_PERSONAL;
  const usedBy = agentsUsingSkill(vm, id);
  const lineCount = vm.skillLineCounts[id] || 0;

  return html`
    <article class="plugin-card ${isViewing ? 'is-selected' : ''}"
      role="button"
      tabindex="0"
      aria-label="View skill ${id}"
      data-testid="skill-card"
      data-skill-id=${id}
      @click=${(e) => vm.onCardClick(e, () => vm.onViewSkill(id))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onViewSkill(id))}
    >
      <header class="plugin-card-top">
        <span class="plugin-card-pill">${SKILL_ICON}</span>
        <div class="plugin-card-identity">
          <span class="plugin-card-name">${displayName}</span>
        </div>
      </header>
      <footer class="plugin-card-meta">
        ${usedBy.length ? html`
          ${usedBy.map((name) => html`<span class="plugin-card-count">⚡ ${name}</span>`)}
        ` : nothing}
        ${isPersonal ? html`<span class="plugin-card-badge">Personal</span>` : nothing}
        <span class="plugin-card-count" title="Line count">${lineCount} lines</span>
      </footer>
    </article>
  `;
}

function renderSkillRow(vm, id) {
  const description = vm.skillDescriptions[id] || '';
  const displayName = vm.skillDisplayNames[id] || id;
  const isViewing = vm.viewingSkillId === id;
  const isPersonal = vm.skillScopes[id] === AO_SCOPE_PERSONAL;
  const usedBy = agentsUsingSkill(vm, id);
  const lineCount = vm.skillLineCounts[id] || 0;

  return html`
    <div class="catalog-row ${isViewing ? 'is-selected' : ''}" role="button"
      tabindex="0"
      aria-label="View skill ${id}"
      data-testid="skill-card"
      data-skill-id=${id}
      @click=${(e) => vm.onCardClick(e, () => vm.onViewSkill(id))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onViewSkill(id))}
    >
      <span class="catalog-row-pill">${SKILL_ICON}</span>
      <div class="catalog-row-body">
        <div class="catalog-row-title-line">
          <span class="catalog-row-name">${displayName}</span>
          ${isPersonal ? html`<span class="catalog-row-meta">Personal</span>` : nothing}
          ${usedBy.length ? html`
            <span class="catalog-row-meta">⚡ ${usedBy[0]}${usedBy.length > 1 ? ` +${usedBy.length - 1}` : ''}</span>
          ` : nothing}
        </div>
      </div>
      <span class="catalog-row-meta" title="Line count">${lineCount} lines</span>
      ${DRILL_CHEVRON}
    </div>
  `;
}

// ─── Skill detail drill-down (AO-style) ──────────────────────────────────────

const FILE_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V6L9 2z"/><path d="M9 2v4h4"/></svg>`;

function renderSkillDetail(vm) {
  const id = vm.viewingSkillId;
  const body = vm.skills[id] || '';
  const fm = parseFrontmatter(body);
  const name = fm?.fields?.name || id;
  const description = vm.skillDescriptions[id] || fm?.fields?.description || extractTitle(body) || '';
  const usedBy = agentsUsingSkill(vm, id);
  const isPersonal = vm.skillScopes[id] === AO_SCOPE_PERSONAL;
  const readOnly = !isPersonal;
  const pluginName = usedBy.length ? usedBy[0] : null;
  const origin = isPersonal ? 'personal' : (vm.skillScopes[id] || 'application');

  return html`
    <div class="skill-detail">
      <header class="skill-detail-header">
        <div class="skill-detail-identity">
          <span class="skill-detail-icon">${TAB_ICON_MAP[TAB_SKILLS]}</span>
          <div>
            <span class="skill-detail-name">${name}</span>
          </div>
        </div>
        ${!readOnly ? html`
          <div class="skill-detail-actions">
            <button type="button" class="skill-detail-action-btn is-negative"
              @click=${() => vm.onDeleteSkillById(id)}
            >Delete</button>
          </div>
        ` : nothing}
      </header>
      <div class="skill-detail-description">
        ${description || 'No description provided.'}
      </div>

      <button type="button" class="skill-detail-view-md"
        @click=${() => vm.onOpenSkillMdModal()}
      >${FILE_ICON} View SKILL.md</button>
    </div>
  `;
}

function agentSkillIds(agent) {
  return agent.skills || agent.preset?.skills || [];
}

function agentMcpServerIds(agent, isBuiltin) {
  if (isBuiltin) return agent.mcpServers || [];
  if (Array.isArray(agent.mcpServers)) return agent.mcpServers;
  if (Array.isArray(agent.preset?.mcpServers)) return agent.preset.mcpServers;
  return [];
}

function renderAgentCard(vm, agent, isBuiltin = false) {
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const description = agent.description || agent.preset?.description || '';
  const skills = agentSkillIds(agent);
  const mcps = agentMcpServerIds(agent, isBuiltin);
  const skillCount = skills.length;
  const mcpCount = mcps.length;

  return html`
    <article class="plugin-card" role="button" tabindex="0"
      aria-label="Open agent ${title}"
      data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
      @click=${(e) => vm.onCardClick(e, () => vm.onSelectAgent(agent))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onSelectAgent(agent))}
    >
      <header class="plugin-card-top">
        <span class="plugin-card-pill">${PLUGIN_ICON}</span>
        <div class="plugin-card-identity">
          <span class="plugin-card-name">${title}</span>
          <span class="plugin-card-source">${isBuiltin ? 'built-in' : 'custom'}</span>
        </div>
      </header>
      <footer class="plugin-card-meta">
        ${skillCount ? html`<span class="plugin-card-count">${skillCount} Skill${skillCount > 1 ? 's' : ''}</span>` : nothing}
        ${mcpCount ? html`<span class="plugin-card-count">${mcpCount} MCP${mcpCount > 1 ? 's' : ''}</span>` : nothing}
        ${isBuiltin ? html`
          <span class="plugin-card-badge is-builtin">Built-in</span>
        ` : html`
          <button type="button" class="plugin-card-action is-uninstall"
            aria-label="Uninstall agent ${title}"
            @click=${(e) => { e.stopPropagation(); vm.onDeleteAgent(agent); }}
          >Uninstall</button>
        `}
      </footer>
    </article>
  `;
}

function renderAgentRow(vm, agent, isBuiltin = false) {
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const description = agent.description || agent.preset?.description || '';
  const source = isBuiltin ? 'built-in' : 'custom';
  const skills = agentSkillIds(agent);
  const skillCount = skills.length;

  return html`
    <div class="catalog-row" role="button" tabindex="0"
      aria-label="Open agent ${title}"
      data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
      @click=${(e) => vm.onCardClick(e, () => vm.onSelectAgent(agent))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onSelectAgent(agent))}
    >
      <span class="catalog-row-pill">${PLUGIN_ICON}</span>
      <div class="catalog-row-body">
        <div class="catalog-row-title-line">
          <span class="catalog-row-name">${title}</span>
          <span class="catalog-row-meta">${source}</span>
          ${skillCount ? html`<span class="catalog-row-meta">${skillCount} Skill${skillCount > 1 ? 's' : ''}</span>` : nothing}
        </div>
        ${description ? html`<span class="catalog-row-desc">${description}</span>` : nothing}
      </div>
      ${isBuiltin ? nothing : html`
        <button type="button" class="plugin-row-action is-uninstall"
          aria-label="Uninstall agent ${title}"
          @click=${(e) => { e.stopPropagation(); vm.onDeleteAgent(agent); }}
        >× Uninstall</button>
      `}
      ${DRILL_CHEVRON}
    </div>
  `;
}

// ─── Plugin detail drill-down (AO-style) ─────────────────────────────────────

function renderPluginDetail(vm) {
  const agent = [...BUILTIN_AGENTS, ...(vm.agents || [])].find(
    (a) => a.id === vm.selectedAgentId,
  );
  if (!agent) return nothing;

  const isBuiltin = BUILTIN_AGENTS.some((a) => a.id === agent.id);
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const source = isBuiltin ? 'built-in' : 'custom';
  const description = agent.description || agent.preset?.description || '';
  const skillIds = agentSkillIds(agent);
  const isGrid = vm.catalogViewMode === 'grid';

  return html`
    <div class="skill-detail">
      <header class="skill-detail-header">
        <div class="skill-detail-identity">
          <span class="skill-detail-icon">${PLUGIN_ICON}</span>
          <div>
            <span class="skill-detail-name">${title}</span>
          </div>
        </div>
        ${!isBuiltin ? html`
          <div class="skill-detail-actions">
            <button type="button" class="skill-detail-action-btn is-negative"
              @click=${() => vm.onDeleteAgent(agent)}
            >Uninstall</button>
          </div>
        ` : nothing}
      </header>

      ${description ? html`
        <div class="skill-detail-description">${description}</div>
      ` : nothing}

      ${skillIds.length ? html`
        <div class="plugin-detail-skills">
          <div class="plugin-detail-skills-header">
            <span class="skill-detail-section-label">Skills ${skillIds.length}</span>
            ${renderViewToggle(vm)}
          </div>
          ${isGrid ? html`
            <div class="plugin-grid">${skillIds.map((id) => renderSkillCard(vm, id))}</div>
          ` : html`
            <div class="catalog-list">${skillIds.map((id) => renderSkillRow(vm, id))}</div>
          `}
        </div>
      ` : nothing}

      <div class="plugin-detail-skills">
        <span class="skill-detail-section-label">Dependencies</span>
        ${renderDepTree(vm, agent, isBuiltin)}
      </div>
    </div>
  `;
}

// ─── tab items (static, computed once at module load) ─────────────────────────

const TAB_ITEMS = CATALOG_TABS.map((t) => ({ ...t, icon: TAB_ICON_MAP[t.id] }));

// Split-left glyph — same asset and relative path the canvas header uses, so it
// resolves against the da-live page origin (no inlined SVG, no da-nx dependency).
/* eslint-disable max-len */
const CHAT_TOGGLE_ICON = html`<svg class="chat-toggle-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="/img/icons/s2-icon-splitleft-20-n.svg#icon"></use></svg>`;
/* eslint-enable max-len */

// ─── exported render functions ────────────────────────────────────────────────

export function renderTopNav(vm) {
  return html`
    <nav class="top-nav" aria-label="Skills Editor navigation">
      ${!vm.isChatOpen ? html`<button type="button"
        class="chat-toggle-btn"
        aria-label="Open Assistant"
        @click=${() => vm.onToggleChat()}
      >${CHAT_TOGGLE_ICON}</button>` : nothing}
      <div class="nav-pill">
        <nx-tabs
          .items=${TAB_ITEMS}
          .active=${vm.catalogTab}
          @tab-change=${(e) => vm.onTabChange(e.detail.id)}
        ></nx-tabs>
      </div>
    </nav>
  `;
}

export function renderChatDrawer(vm) {
  return html`
    <div class="chat-drawer" aria-hidden=${vm.isChatOpen ? 'false' : 'true'}
      ?inert=${!vm.isChatOpen}
      @nx-panel-close=${(e) => { e.stopPropagation(); vm.onToggleChat(); }}>
      ${vm.isChatOpen ? html`
        <nx-chat agent-id=${vm.chatAgentId || nothing}></nx-chat>
      ` : nothing}
    </div>
  `;
}

// TAB_LABEL_MAP and TAB_DESCRIPTIONS are imported from constants.js

const BACK_ARROW_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>`;
const TRASH_ICON = html`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4h12M5 4V2.5A.5.5 0 0 1 5.5 2h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l1 9.5A.5.5 0 0 0 4.5 14h7a.5.5 0 0 0 .5-.5L13 4"/></svg>`;
const SEARCH_ICON = html`<svg class="search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg>`;

function renderDetailView(vm) {
  const tab = vm.catalogTab;
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const isMemory = tab === TAB_MEMORY;

  const skillDrillDown = isSkill && vm.viewingSkillId && !vm.isFormEdit;
  if (skillDrillDown) {
    return html`
      <div class="detail-view">
        <button type="button" class="detail-back-btn"
          @click=${() => vm.onCloseEditor()}
        >${BACK_ARROW_ICON}<span>${TAB_LABEL_MAP[tab] || 'Skills'}</span></button>
        ${renderSkillDetail(vm)}
      </div>
    `;
  }

  const pluginDrillDown = isAgent && vm.isAgentViewTools && vm.selectedAgentId;
  if (pluginDrillDown) {
    return html`
      <div class="detail-view">
        <button type="button" class="detail-back-btn"
          @click=${() => vm.onCloseEditor()}
        >${BACK_ARROW_ICON}<span>${TAB_LABEL_MAP[tab] || 'Plugins'}</span></button>
        ${renderPluginDetail(vm)}
      </div>
    `;
  }

  const title = editorTitle(vm, tab);
  const showBack = tab !== TAB_MEMORY;
  const backLabel = (isSkill && vm.viewingSkillId)
    ? vm.viewingSkillId
    : (TAB_LABEL_MAP[tab] || 'List');

  return html`
    <div class="detail-view">
      ${showBack ? html`
        <button type="button" class="detail-back-btn"
          @click=${() => vm.onCloseEditor()}
        >${BACK_ARROW_ICON}<span>${backLabel}</span></button>
      ` : nothing}
      <div class="editor-header">
        <h3 class="editor-title">${title}</h3>
      </div>
      ${vm.isFormDirty && !isMcp ? html`
        <div class="dirty-notice" role="status">Unsaved edits · save to persist</div>
      ` : nothing}
      <div class="editor-body ${isMemory ? 'editor-body-memory' : ''} ${isSkill ? 'editor-body-skill' : ''}">
        ${isSkill ? renderSkillForm(vm) : nothing}
        ${isAgent && !vm.isAgentViewTools ? renderAgentForm(vm) : nothing}
        ${isPrompt ? renderPromptForm(vm) : nothing}
        ${isMcp && (vm.editingMcpKey || !vm.viewingMcpServerId)
      ? renderMcpForm(vm) : nothing}
        ${isMcp && vm.viewingMcpServerId && !vm.editingMcpKey
      ? renderMcpServerInfo(vm) : nothing}
        ${isMcp && (vm.viewingMcpServerId || vm.editingMcpKey)
      ? renderMcpToolsList(vm) : nothing}
        ${isMemory ? html`
          <p class="form-hint">.da/agent/memory.md</p>
          ${renderMemoryContent(vm)}
        ` : nothing}
      </div>
      ${(isSkill || (isAgent && !vm.isAgentViewTools) || isPrompt
      || (isMcp && (!vm.viewingMcpServerId || vm.editingMcpKey))) ? html`
        <div class="editor-footer">
          ${renderEditorFooter(vm, tab)}
        </div>
      ` : nothing}
    </div>
  `;
}

function renderCatalogView(vm) {
  const { catalogTab: tab } = vm;
  const showSearch = [TAB_SKILLS, TAB_PROMPTS, TAB_MCPS].includes(tab);
  const tabLabel = TAB_LABEL_MAP[tab] || '';
  const tabDesc = TAB_DESCRIPTIONS[tab] || '';

  return html`
    <div class="catalog-scroll">
      <header class="tab-header">
        <div class="tab-header-row">
          <div>
            <h2 class="tab-title">${tabLabel}</h2>
            ${tabDesc ? html`<p class="tab-description">${tabDesc}</p>` : nothing}
          </div>
          ${TAB_ACTIONS[tab] ? html`
            <button type="button" class="new-btn"
              ?disabled=${TAB_ACTIONS[tab].disabled || (TAB_ACTIONS[tab].canWriteKey && !vm[TAB_ACTIONS[tab].canWriteKey])}
              @click=${() => {
        const { opener } = TAB_ACTIONS[tab];
        if (opener && typeof vm[opener] === 'function') vm[opener]();
      }}
            >${ACTION_ICONS[TAB_ACTIONS[tab].icon] ? html`<span class="new-btn-icon">${ACTION_ICONS[TAB_ACTIONS[tab].icon]}</span>` : nothing}${TAB_ACTIONS[tab].btnLabel}</button>
          ` : nothing}
        </div>
      </header>
      ${showSearch ? html`
        <div class="list-search">
          ${SEARCH_ICON}
          <input
            type="search"
            placeholder="Search ${tabLabel.toLowerCase()}…"
            aria-label="Search ${tabLabel.toLowerCase()}"
            .value=${vm.promptSearch}
            @input=${(e) => vm.setPromptSearch(e.target.value)}
          >
        </div>
      ` : nothing}
      ${tab === TAB_SKILLS ? renderSkillsCatalog(vm) : nothing}
      ${tab === TAB_AGENTS ? renderAgentsCatalog(vm) : nothing}
      ${tab === TAB_PROMPTS ? renderPromptsCatalog(vm) : nothing}
      ${tab === TAB_MCPS ? renderMcpsCatalog(vm) : nothing}
      ${tab === TAB_MARKETPLACE ? html`<div class="empty">Coming soon</div>` : nothing}
    </div>
  `;
}

export function renderListCol(vm) {
  const isMemoryDirect = vm.catalogTab === TAB_MEMORY;

  return html`
    <div class="col col-list" role="region" aria-label="Catalog">
      ${vm.isEditorOpen || isMemoryDirect
      ? renderDetailView(vm)
      : renderCatalogView(vm)}
    </div>
  `;
}

export function renderSkillForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input
        type="text"
        placeholder="skill-id"
        aria-label="Skill ID"
        .value=${vm.formSkillId}
        ?readonly=${vm.isFormEdit}
        @input=${(e) => vm.setFormSkillId(e.target.value)}
      >
      <div class="textarea-wrap ${vm.hasSuggestion ? 'is-suggestion' : ''}">
        <div class="skill-body-cm-host"></div>
      </div>
    </form>
  `;
}

export function renderAgentForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <p class="form-hint">Creates <code>/.da/agents/&lt;id&gt;.json</code></p>
      <input
        type="text"
        placeholder="agent-id"
        aria-label="Agent ID"
        .value=${vm.newAgentId}
        @input=${(e) => vm.setNewAgentId(e.target.value)}
      >
      <input
        type="text"
        placeholder="Display name"
        aria-label="Agent display name"
        .value=${vm.newAgentName}
        @input=${(e) => vm.setNewAgentName(e.target.value)}
      >
    </form>
  `;
}

export function renderPromptForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input type="text" placeholder="Title" aria-label="Prompt title"
        .value=${vm.formPromptTitle}
        @input=${(e) => vm.setFormPromptTitle(e.target.value)}
      >
      <input type="text" placeholder="Category (e.g. Review, Workflow…)" aria-label="Prompt category"
        list="category-list"
        .value=${vm.formPromptCategory}
        @input=${(e) => vm.setFormPromptCategory(e.target.value)}
      >
      <input type="url" placeholder="Icon URL" aria-label="Prompt icon URL"
        .value=${vm.formPromptIcon}
        @input=${(e) => vm.setFormPromptIcon(e.target.value)}
      >
      <datalist id="category-list">
        ${CATEGORY_OPTIONS.map((c) => html`<option value=${c}></option>`)}
      </datalist>
      <div class="textarea-wrap">
        <textarea
          placeholder="Write your prompt…"
          aria-label="Prompt body"
          .value=${vm.formPromptBody}
          @input=${(e) => vm.setFormPromptBody(e.target.value)}
        ></textarea>
      </div>
    </form>
  `;
}

export function renderAssociatedToolsSelector(vm) {
  const builtIn = BUILTIN_TOOL_IDS;
  const mcpToolIds = [];
  if (vm.mcpTools?.servers) {
    vm.mcpTools.servers.forEach((server) => {
      (server.tools || []).forEach((tool) => {
        mcpToolIds.push(`mcp__${server.id}__${tool.name}`);
      });
    });
  }

  const toolFilter = (vm.toolsSearch || '').trim().toLowerCase();
  const filterById = (id) => id.toLowerCase().includes(toolFilter);
  const daTools = toolFilter ? builtIn.filter(filterById) : builtIn;
  const mcpTools = toolFilter ? mcpToolIds.filter(filterById) : mcpToolIds;
  const selected = new Set(vm.formPromptTools || []);
  const collapsed = vm.toolsGroupCollapsed || {};

  const renderGroup = (ns, tools) => {
    if (!tools.length && !toolFilter) return nothing;
    const isOpen = !collapsed[ns];
    return html`
      <details class="tools-group" ?open=${isOpen}
        @toggle=${(e) => vm.setToolsGroupCollapsed(ns, !e.target.open)}
      >
        <summary class="tools-group-summary">
          <span class="tools-group-label">${ns}</span>
          <span class="tools-count">${tools.length}</span>
        </summary>
        <ul class="tools-group-list" aria-label="${ns} tools">
          ${!tools.length ? html`<li class="tool-item-empty">No tools match filter</li>` : nothing}
          ${tools.map((toolId) => {
      const isActive = selected.has(toolId);
      return html`
              <li class="tool-item ${isActive ? 'is-active' : ''}">
                <span class="tool-dot ${isActive ? 'is-dot-active' : 'is-dot-inactive'}" aria-hidden="true"></span>
                <label class="tool-label-wrap" title=${toolId}>
                  <input type="checkbox" class="tool-checkbox"
                    .checked=${isActive}
                    @change=${(e) => {
          const prevTools = vm.formPromptTools ? [...vm.formPromptTools] : [];
          const next = new Set(prevTools);
          if (e.target.checked) next.add(toolId);
          else next.delete(toolId);
          vm.setFormPromptTools([...next]);
          const { serverId, toolName } = vm.parseToolId(toolId);
          vm.onToggleToolEnabled(serverId, toolName, e.target.checked, () => {
            vm.setFormPromptTools(prevTools);
          });
        }}
                  >
                  <span class="tool-label">${toolId}</span>
                </label>
              </li>
            `;
    })}
        </ul>
      </details>
    `;
  };

  return html`
    <div class="tools-selector">
      <h4 class="tools-selector-heading">Associated Tools</h4>
      <input
        type="search"
        class="tools-search-input"
        placeholder="Filter tools…"
        aria-label="Filter tools"
        .value=${vm.toolsSearch}
        @input=${(e) => vm.setToolsSearch(e.target.value)}
      >
      ${renderGroup('DA', daTools)}
      ${mcpTools.length || toolFilter ? renderGroup('MCP', mcpTools) : nothing}
    </div>
  `;
}

export function renderMcpForm(vm) {
  const headers = vm.mcpHeaders || [];
  const hasSecret = headers.some((h) => isSensitiveHeaderName(h.name) && String(h.value || '').trim());
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <div class="form-field">
        <label class="form-label" for="mcp-server-id">Server ID</label>
        <input id="mcp-server-id" type="text" placeholder="e.g. my-server" aria-label="MCP server id"
          .value=${vm.mcpKey}
          ?readonly=${Boolean(vm.editingMcpKey)}
          @input=${(e) => vm.setMcpKey(e.target.value)}
        >
        <p class="form-hint">Identifier only. Do not paste secrets or API keys here.</p>
      </div>
      <div class="form-field">
        <label class="form-label" for="mcp-server-url">SSE Endpoint URL</label>
        <input id="mcp-server-url" type="text" placeholder="https://…/sse" aria-label="MCP server URL"
          .value=${vm.mcpUrl}
          @input=${(e) => vm.setMcpUrl(e.target.value)}
        >
      </div>
      <textarea
        class="textarea-sm"
        placeholder="Description — what this server does (optional)"
        aria-label="MCP server description"
        .value=${vm.mcpDescription}
        @input=${(e) => vm.setMcpDescription(e.target.value)}
      ></textarea>
      <div class="mcp-auth-section ${hasSecret ? 'is-sensitive' : ''}">
        <p class="form-hint">HTTP headers (optional — e.g. Authorization, x-api-key)</p>
        ${headers.map((h, i) => {
    const masked = isSensitiveHeaderName(h.name);
    return html`
            <div class="mcp-header-row">
              <input
                type="text"
                placeholder="Header name"
                aria-label="Header name ${i + 1}"
                .value=${h.name}
                @input=${(e) => vm.setMcpHeader(i, 'name', e.target.value)}
              >
              <input
                type=${masked ? 'password' : 'text'}
                autocomplete=${masked ? 'new-password' : 'off'}
                placeholder="Header value"
                aria-label="Header value ${i + 1}"
                .value=${h.value}
                @input=${(e) => vm.setMcpHeader(i, 'value', e.target.value)}
              >
              <button type="button" class="btn-icon mcp-header-remove"
                aria-label="Remove header ${i + 1}"
                @click=${() => vm.removeMcpHeader(i)}
              >✕</button>
            </div>
          `;
  })}
        <button type="button" class="action-btn mcp-header-add"
          @click=${() => vm.addMcpHeader()}
        >+ Add header</button>
        ${hasSecret ? html`
          <p class="mcp-auth-warning" role="note">
            Warning: saving headers makes them available to all authors with configuration permission.
          </p>
        ` : nothing}
      </div>
    </form>
  `;
}

export function renderMcpServerInfo(vm) {
  const serverId = vm.viewingMcpServerId;
  const builtin = BUILTIN_MCP_SERVERS.find((s) => s.id === serverId);
  if (!builtin) return nothing;
  return html`
    <div class="mcp-server-info">
      <p class="mcp-server-desc">${builtin.description}</p>
      <span class="badge">built-in</span>
    </div>
  `;
}

export function renderMcpToolsList(vm) {
  const serverId = vm.viewingMcpServerId || vm.editingMcpKey;
  if (!serverId) return nothing;

  const { tools, error, source } = mcpServerToolData(vm, serverId);

  const overrides = vm.toolOverrides || {};
  const filterQ = (vm.toolsSearch || '').trim().toLowerCase();
  const filtered = filterQ
    ? tools.filter((t) => t.name.toLowerCase().includes(filterQ)
      || t.description.toLowerCase().includes(filterQ))
    : tools;

  const emptyMsg = () => {
    if (source === 'pending') return 'Connecting to agent to discover tools…';
    if (source === 'unconfigured') return 'Enable this server to discover its tools';
    if (source === 'error') {
      const urlMatch = error?.match(/https?:\/\/\S+/);
      const hint = urlMatch?.[0];
      const base = error?.split('\n')[0] ?? error;
      return html`
        Could not list tools: ${base}
        ${hint ? html`
          <br>
          <span class="mcp-error-hint">Did you mean:
            <a class="mcp-error-url" href="#"
              @click=${(e) => {
            e.preventDefault();
            vm.setMcpUrl(hint);
            vm.onSetStatus(`URL updated to ${hint} — save to apply`, STATUS_TYPE.WARN);
          }}
            >${hint}</a>?
          </span>
        ` : nothing}
      `;
    }
    return 'Server reported 0 tools';
  };

  return html`
    <div class="mcp-tools-section">
      <h4 class="tools-selector-heading">Tools (${tools.length})</h4>
      ${tools.length > 6 ? html`
        <input type="search" class="tools-search-input"
          placeholder="Filter tools…" aria-label="Filter tools"
          .value=${vm.toolsSearch}
          @input=${(e) => vm.setToolsSearch(e.target.value)}
        >
      ` : nothing}
      ${!tools.length
      ? html`<div class="empty ${source === 'error' ? 'empty-err' : ''}">${emptyMsg()}</div>`
      : html`
          <ul class="tools-group-list" aria-label="Tools for ${serverId}">
            ${filtered.map((t) => {
        const key = `${serverId}/${t.name}`;
        const isEnabled = overrides[key] !== false;
        return html`
                <li class="tool-item ${isEnabled ? 'is-active' : ''}">
                  <label class="tool-label-wrap" title=${t.name}>
                    <input type="checkbox" class="tool-checkbox"
                      .checked=${isEnabled}
                      @change=${(e) => vm.onToggleToolEnabled(serverId, t.name, e.target.checked)}
                    >
                    <div class="tool-text">
                      <span class="tool-label">${t.name}</span>
                      ${t.description ? html`
                        <span class="tool-desc">${t.description}</span>
                      ` : nothing}
                    </div>
                  </label>
                </li>
              `;
      })}
            ${filtered.length === 0 && tools.length
          ? html`<li class="tool-item-empty">No tools match filter</li>` : nothing}
          </ul>
        `}
    </div>
  `;
}

export function renderEditorFooter(vm, tab) {
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const statusTpl = vm.statusMsg ? html`
    <output class="msg ${msgClass(vm.statusType)}">
      ${vm.statusMsg}
    </output>
  ` : nothing;

  if (isSkill) {
    const curStatus = vm.isFormEdit
      ? (vm.skillStatuses[vm.formSkillId] || STATUS.DRAFT)
      : STATUS.DRAFT;
    const isDraft = curStatus === STATUS.DRAFT;

    return html`
      <div class="editor-actions" role="toolbar" aria-label="Skill actions">
        ${vm.isFormEdit || vm.hasSuggestion ? html`
          <button type="button" data-variant="secondary"
            ?disabled=${vm.isSaveBusy}
            @click=${() => vm.onDismissForm()}
          >Dismiss</button>
        ` : nothing}
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSaveSkill(curStatus)}
        >Save</button>
        ${vm.isFormEdit ? html`
          <button type="button" data-variant="secondary"
            ?disabled=${vm.isSaveBusy}
            @click=${() => vm.onSaveSkill(isDraft ? STATUS.APPROVED : STATUS.DRAFT)}
          >${isDraft ? 'Approve' : 'Move to Draft'}</button>
        ` : nothing}
        ${vm.isFormEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${vm.isSaveBusy}
            @click=${vm.onDeleteSkill}
          >Delete</button>
        ` : nothing}
      </div>
      ${statusTpl}
    `;
  }

  if (isAgent) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="Agent actions">
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy || !vm.newAgentId.trim()}
          @click=${vm.onSaveAgent}
        >Save Agent File</button>
      </div>
      ${statusTpl}
    `;
  }

  if (isPrompt) {
    const pStatus = String(
      vm.isFormPromptEdit
        ? (vm.prompts.find((p) => p.title === vm.formPromptTitle)?.status ?? '').trim().toLowerCase()
        : '',
    );
    const pIsDraft = !pStatus || pStatus === STATUS.DRAFT;

    return html`
      <div class="editor-actions" role="toolbar" aria-label="Prompt actions">
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSavePrompt(pIsDraft ? STATUS.DRAFT : STATUS.APPROVED)}
        >Save</button>
        ${vm.isFormPromptEdit ? html`
          <button type="button" data-variant="secondary"
            ?disabled=${vm.isSaveBusy}
            @click=${() => vm.onSavePrompt(pIsDraft ? STATUS.APPROVED : STATUS.DRAFT)}
          >${pIsDraft ? 'Approve' : 'Move to Draft'}</button>
        ` : nothing}
        <button type="button" data-variant="secondary"
          title="Insert prompt text into the chat input without sending"
          ?disabled=${vm.isSaveBusy || !vm.formPromptBody.trim()}
          @click=${() => {
        vm.onDispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, vm.formPromptBody);
        vm.onDispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, vm.formPromptBody);
      }}
        >Add to Chat</button>
        <button type="button" data-variant="secondary"
          title="Send prompt to the assistant immediately"
          ?disabled=${vm.isSaveBusy || !vm.formPromptBody.trim()}
          @click=${() => vm.onRunPrompt()}
        >Send to Chat</button>
        ${vm.isFormPromptEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${vm.isSaveBusy}
            @click=${vm.onDeletePrompt}
          >Delete</button>
        ` : nothing}
      </div>
      ${statusTpl}
    `;
  }

  if (isMcp) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="MCP actions">
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy || !vm.mcpKey.trim() || !vm.mcpUrl.trim()}
          @click=${vm.onRegisterMcp}
        >${vm.editingMcpKey ? 'Update' : 'Register'}</button>
        ${vm.editingMcpKey ? html`
          <button type="button" data-variant="negative"
            ?disabled=${vm.isSaveBusy}
            @click=${() => vm.onDeleteMcpDirect({ key: vm.editingMcpKey })}
          >Delete</button>
        ` : nothing}
      </div>
      ${statusTpl}
    `;
  }

  return nothing;
}

export function renderSkillsCatalog(vm) {
  const ids = Object.keys(vm.skills);
  const searchQuery = vm.promptSearch.trim().toLowerCase();

  let filtered = vm.catalogFilter === 'personal'
    ? ids.filter((id) => vm.skillScopes[id] === AO_SCOPE_PERSONAL)
    : ids;

  if (searchQuery) {
    filtered = filtered.filter((id) => {
      const description = (vm.skillDescriptions[id] || '').toLowerCase();
      return id.toLowerCase().includes(searchQuery) || description.includes(searchQuery);
    });
  }

  const isGrid = vm.catalogViewMode === 'grid';

  return html`
    <div class="catalog-toolbar" role="toolbar" aria-label="Filter skills">
      <button type="button"
        class="filter-chip ${vm.catalogFilter === 'all' ? 'is-active' : ''}"
        aria-pressed=${vm.catalogFilter === 'all' ? 'true' : 'false'}
        @click=${() => vm.setCatalogFilter('all')}
      >All</button>
      <button type="button"
        class="filter-chip ${vm.catalogFilter === 'personal' ? 'is-active' : ''}"
        aria-pressed=${vm.catalogFilter === 'personal' ? 'true' : 'false'}
        @click=${() => vm.setCatalogFilter('personal')}
      >Personal</button>
      ${renderViewToggle(vm)}
    </div>
    ${!filtered.length ? html`<div class="empty">No skills found</div>` : nothing}
    ${filtered.length && isGrid ? html`<div class="plugin-grid">${filtered.map((id) => renderSkillCard(vm, id))}</div>` : nothing}
    ${filtered.length && !isGrid ? html`<div class="catalog-list">${filtered.map((id) => renderSkillRow(vm, id))}</div>` : nothing}
  `;
}

function renderDepTree(vm, agent, isBuiltin) {
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const skills = agentSkillIds(agent);
  const mcps = agentMcpServerIds(agent, isBuiltin);

  return html`
    <div class="dep-tree" aria-label="Dependency tree for ${title}">
      <div class="dep-tree-node">
        <span class="entity-chip entity-chip-agent">${title}</span>
      </div>
      ${skills.map((s) => html`
        <div class="dep-tree-node dep-tree-indent">
          <span class="dep-tree-connector">├─</span>
          <span class="entity-chip entity-chip-skill">${s}</span>
        </div>
      `)}
      ${mcps.map((mcpId) => {
    const tools = BUILTIN_TOOL_DETAILS[mcpId] || [];
    return html`
          <div class="dep-tree-node dep-tree-indent">
            <span class="dep-tree-connector">├─</span>
            <span class="entity-chip entity-chip-mcp">${mcpId}</span>
          </div>
          ${tools.slice(0, 6).map((t, i) => html`
            <div class="dep-tree-node dep-tree-indent-2">
              <span class="dep-tree-connector">${i < Math.min(tools.length, 6) - 1 ? '├─' : '└─'}</span>
              <span class="entity-chip entity-chip-tool">${t.name}</span>
            </div>
          `)}
          ${tools.length > 6 ? html`
            <div class="dep-tree-node dep-tree-indent-2">
              <span class="dep-tree-connector">└─</span>
              <span class="mcp-tool-inline-desc">+ ${tools.length - 6} more</span>
            </div>
          ` : nothing}
        `;
  })}
    </div>
  `;
}

export function renderAgentsCatalog(vm) {
  const isGrid = vm.catalogViewMode === 'grid';
  const filter = vm.agentFilter || 'all';
  const builtinCount = BUILTIN_AGENTS.length;
  const customCount = vm.agents.length;
  const totalCount = builtinCount + customCount;

  const builtinTagged = BUILTIN_AGENTS.map((a) => ({ agent: a, builtin: true }));
  const customTagged = vm.agents.map((a) => ({ agent: a, builtin: false }));
  const allAgents = [...builtinTagged, ...customTagged];

  const filterMap = { builtin: builtinTagged, custom: customTagged };
  const filtered = filterMap[filter] || allAgents;

  return html`
    <div class="catalog-toolbar" role="toolbar" aria-label="Agent view controls">
      <div class="filter-pills" role="tablist" aria-label="Filter plugins">
        <button type="button" class="filter-pill ${filter === 'all' ? 'is-active' : ''}"
          role="tab" aria-selected=${filter === 'all'}
          @click=${() => vm.onSetAgentFilter('all')}
        >All <span class="filter-pill-count">${totalCount}</span></button>
        <button type="button" class="filter-pill ${filter === 'builtin' ? 'is-active' : ''}"
          role="tab" aria-selected=${filter === 'builtin'}
          @click=${() => vm.onSetAgentFilter('builtin')}
        >Built-in <span class="filter-pill-count">${builtinCount}</span></button>
        ${customCount ? html`
          <button type="button" class="filter-pill ${filter === 'custom' ? 'is-active' : ''}"
            role="tab" aria-selected=${filter === 'custom'}
            @click=${() => vm.onSetAgentFilter('custom')}
          >Custom <span class="filter-pill-count">${customCount}</span></button>
        ` : nothing}
      </div>
      ${renderViewToggle(vm)}
    </div>

    ${isGrid
      ? html`<div class="plugin-grid">${filtered.map(({ agent, builtin }) => renderAgentCard(vm, agent, builtin))}</div>`
      : html`<div class="catalog-list">${filtered.map(({ agent, builtin }) => renderAgentRow(vm, agent, builtin))}</div>`}
  `;
}

export function renderPromptsCatalog(vm) {
  const searchQuery = vm.promptSearch.trim().toLowerCase();
  const prompts = searchQuery
    ? vm.prompts.filter((r) => (r.title || '').toLowerCase().includes(searchQuery)
      || (r.category || '').toLowerCase().includes(searchQuery))
    : vm.prompts;

  if (!prompts.length) {
    return html`<div class="empty">No prompts found</div>`;
  }

  return html`
    <div class="prompt-list" role="list" aria-label="Prompts">
      ${prompts.map((row) => {
    const title = row.title || '';
    const isSelected = vm.isEditorOpen && vm.isFormPromptEdit
      && vm.formPromptTitle === title;
    const cat = (row.category || '').toLowerCase().trim();
    const catClass = KNOWN_CATEGORY_CLASSES.has(cat) ? cat : 'default';
    return html`
          <article role="listitem" data-testid="prompt-card" data-prompt-title=${title}>
            <div class="prompt-row ${isSelected ? 'is-selected' : ''}" role="button"
              tabindex="0"
              aria-label="Edit prompt ${title || '(untitled)'}"
              @click=${(e) => vm.onCardClick(e, () => vm.onOpenEditor(row))}
              @keydown=${(e) => vm.onCardKeydown(e, () => vm.onOpenEditor(row))}
            >
              <span class="prompt-row-pill">${PROMPT_ICON}</span>
              <div class="prompt-row-body">
                <div class="prompt-row-title-line">
                  <span class="prompt-row-title">${title || '(untitled)'}</span>
                  ${row.category ? html`
                    <span class="category-badge cat-${catClass}">${row.category}</span>
                  ` : nothing}
                </div>
                ${row.prompt ? html`
                  <span class="prompt-row-desc">${row.prompt}</span>
                ` : nothing}
              </div>
              ${DRILL_CHEVRON}
            </div>
          </article>
        `;
  })}
    </div>
  `;
}

function mcpShared(vm, s, isBuiltin) {
  const key = isBuiltin ? s.id : (s.key || '');
  const desc = isBuiltin ? s.description : (s.url || s.value || '');
  const toolCount = isBuiltin
    ? (BUILTIN_TOOL_DETAILS[s.id]?.length || 0)
    : mcpServerToolData(vm, key).tools.length;
  let transport = '';
  if (!isBuiltin) transport = s.url ? 'HTTP' : 'stdio';
  const isSelected = isBuiltin
    ? vm.viewingMcpServerId === s.id && !vm.editingMcpKey
    : vm.isEditorOpen && (vm.editingMcpKey === key || vm.viewingMcpServerId === key);
  const onClick = isBuiltin
    ? (e) => vm.onMcpCardClick(e, () => vm.onViewMcpTools(s.id))
    : (e) => vm.onMcpCardClick(e, () => vm.onEditMcp(s));
  const onKey = isBuiltin
    ? (e) => vm.onMcpCardKeydown(e, () => vm.onViewMcpTools(s.id))
    : (e) => vm.onMcpCardKeydown(e, () => vm.onEditMcp(s));
  let badge = 'BUILT-IN';
  if (!isBuiltin) badge = (skillRowStatus(s) === STATUS.APPROVED && skillRowEnabled(s)) ? 'CONNECTED' : 'DISABLED';
  return { key, desc, toolCount, transport, isSelected, onClick, onKey, badge };
}

function renderMcpCard(vm, s, isBuiltin) {
  const { key, desc, toolCount, transport, isSelected, onClick, onKey, badge } = mcpShared(vm, s, isBuiltin);

  return html`
    <article class="plugin-card ${isSelected ? 'is-selected' : ''}"
      role="button" tabindex="0"
      aria-label="${isBuiltin ? 'View' : 'Edit'} MCP server ${key}"
      data-testid=${isBuiltin ? 'mcp-builtin-card' : 'mcp-card'}
      data-mcp-key=${key}
      @click=${onClick} @keydown=${onKey}
    >
      <header class="plugin-card-top">
        <span class="plugin-card-pill">${MCP_ICON}</span>
        <div class="plugin-card-identity">
          <span class="plugin-card-name">${key || '(unnamed)'}</span>
          <span class="plugin-card-source" title=${desc || nothing}>${desc}</span>
        </div>
        ${transport ? html`<span class="plugin-card-badge">${transport}</span>` : nothing}
      </header>
      <footer class="plugin-card-meta">
        <span class="skill-detail-badge plugin-card-badge">Personal</span>
        <span class="plugin-card-count">${toolCount} tools</span>
        ${!isBuiltin ? html`
          <button type="button" class="plugin-card-action is-uninstall"
            aria-label="Delete MCP server ${key}"
            data-testid="mcp-delete-btn"
            @click=${(e) => { e.stopPropagation(); vm.onDeleteMcpDirect(s); }}
          >${TRASH_ICON}</button>
        ` : nothing}
      </footer>
    </article>
  `;
}

function renderMcpRow(vm, s, isBuiltin) {
  const { key, desc, transport, isSelected, onClick, onKey } = mcpShared(vm, s, isBuiltin);

  return html`
    <div class="catalog-row ${isSelected ? 'is-selected' : ''}" role="button" tabindex="0"
      aria-label="${isBuiltin ? 'View' : 'Edit'} MCP server ${key}"
      data-testid=${isBuiltin ? 'mcp-builtin-card' : 'mcp-card'}
      data-mcp-key=${key}
      @click=${onClick} @keydown=${onKey}
    >
      <span class="catalog-row-pill">${MCP_ICON}</span>
      <div class="catalog-row-body">
        <div class="catalog-row-title-line">
          <span class="catalog-row-name">${key || '(unnamed)'}</span>
          <span class="catalog-row-meta">${desc} · ${transport || 'built-in'}</span>
        </div>
      </div>
      ${!isBuiltin ? html`
        <button type="button" class="plugin-row-action is-uninstall"
          aria-label="Delete MCP server ${key}"
          data-testid="mcp-delete-btn"
          @click=${(e) => { e.stopPropagation(); vm.onDeleteMcpDirect(s); }}
        >${TRASH_ICON}</button>
      ` : nothing}
      ${DRILL_CHEVRON}
    </div>
  `;
}

export function renderMcpsCatalog(vm) {
  const searchQuery = vm.promptSearch.trim().toLowerCase();
  const filterPasses = (status) => vm.catalogFilter === 'all' || status === vm.catalogFilter;
  let filteredCustom = vm.mcpRows.filter((row) => filterPasses(skillRowStatus(row)));
  if (searchQuery) {
    filteredCustom = filteredCustom.filter((row) => {
      const key = (row.key || '').toLowerCase();
      const url = (row.url || row.value || '').toLowerCase();
      return key.includes(searchQuery) || url.includes(searchQuery);
    });
  }
  const showBuiltins = filterPasses(STATUS.APPROVED);
  const isGrid = vm.catalogViewMode === 'grid';

  return html`
    <div class="catalog-toolbar" role="toolbar" aria-label="MCP view controls">
      ${renderViewToggle(vm)}
    </div>
    ${showBuiltins ? html`
      <h3 class="section-h">Connected (${BUILTIN_MCP_SERVERS.length})</h3>
      ${isGrid
        ? html`<div class="plugin-grid">${BUILTIN_MCP_SERVERS.map((s) => renderMcpCard(vm, s, true))}</div>`
        : html`<div class="catalog-list">${BUILTIN_MCP_SERVERS.map((s) => renderMcpRow(vm, s, true))}</div>`}
    ` : nothing}
    <h3 class="section-h">Custom (${filteredCustom.length})</h3>
    ${!filteredCustom.length ? html`<div class="empty">No custom MCP servers registered</div>` : nothing}
    ${filteredCustom.length && isGrid ? html`<div class="plugin-grid">${filteredCustom.map((r) => renderMcpCard(vm, r, false))}</div>` : nothing}
    ${filteredCustom.length && !isGrid ? html`<div class="catalog-list">${filteredCustom.map((r) => renderMcpRow(vm, r, false))}</div>` : nothing}
  `;
}

export function renderMemoryContent(vm) {
  if (vm.memory === null) {
    return html`<div class="empty" aria-live="polite">Loading…</div>`;
  }
  if (vm.memory === '') {
    return html`<div class="empty">No project memory yet. The DA agent writes here as it learns about your site.</div>`;
  }
  return html`<div class="memory-cm-host"></div>`;
}
