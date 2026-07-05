/* ========================================
   灵感收藏家 - 玻璃质感 SVG 图标系统
   风格：介于扁平和拟物之间的玻璃感
   stroked 线条为主，半透明填充，圆角收口
   ======================================== */

const ICONS = {
  // --- 导航 ---
  home: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 10.5L12 3l9 7.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M5 9.5V20a1 1 0 001 1h5v-6h2v6h5a1 1 0 001-1V9.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M12 13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  plus: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
    <path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  book: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 3v18M4 8h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  moon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 14.5A7.5 7.5 0 019.5 4C7 4.3 5 5.8 4 8a7.5 7.5 0 0010.5 10.5c2.3-1 3.8-3 4-5.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="15" cy="6" r="1.2" fill="currentColor" opacity="0.35"/>
    <circle cx="8" cy="17" r="0.8" fill="currentColor" opacity="0.25"/>
  </svg>`,

  gear: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  // --- 输入方式 ---
  pen: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 6l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  mic: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="2" width="8" height="12" rx="4" stroke="currentColor" stroke-width="1.8"/>
    <path d="M4 11a8 8 0 0016 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M9 21h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  camera: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="6" width="18" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 3h8l2.5 3h3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // --- 分类图标 ---
  lightbulb: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2a6 6 0 00-3.5 10.8V18a1 1 0 001 1h5a1 1 0 001-1v-5.2A6 6 0 0012 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M10 20h4M11 22h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M12 8v3M10.5 10H12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  document: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M14 2v6h6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M8 13h6M8 17h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  warning: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 20h20L12 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M12 10v4M12 17.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  checklist: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 9l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  link: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 13a5 5 0 007.1.1l2-2a5 5 0 00-7.1-7.1l-1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M14 11a5 5 0 00-7.1-.1l-2 2a5 5 0 007.1 7.1l1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  chat: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3a9 9 0 00-4 17v1.5l3.5-1.5A9 9 0 1012 3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="8" cy="11" r="1" fill="currentColor" opacity="0.4"/>
    <circle cx="12" cy="11" r="1" fill="currentColor" opacity="0.4"/>
    <circle cx="16" cy="11" r="1" fill="currentColor" opacity="0.4"/>
  </svg>`,

  // --- 平台图标 ---
  tv: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 21l3-3 3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  music: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="17" r="3" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="17" cy="7" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 17V5l11-3v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  play: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <path d="M10 8l6 4-6 4V8z" fill="currentColor" opacity="0.6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  help: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <path d="M10 9.5a2 2 0 014 0c0 1.5-2 2.5-2 3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="12" cy="17" r="1" fill="currentColor" opacity="0.5"/>
  </svg>`,

  bird: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 4l-3.5 3.5M21 4h-5M21 4v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M17 6.5A8 8 0 107.5 19L21 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  book_closed: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 6a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M16 4v5h5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M6 14h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  message: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="4" width="20" height="14" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M2 8l10 6 10-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  code: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M14 4l-4 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  globe: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <path d="M2 12h20M12 2a15 15 0 010 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // --- 操作 ---
  copy: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/>
    <path d="M4 16V4h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  share: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8.5 13.5l7-3M8.5 10.5l7 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  trash: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 7h16M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  // --- 状态 ---
  search: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/>
    <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  sparkle: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v5M12 17v5M4 12h5M15 12h5M6.34 6.34l3.54 3.54M14.12 14.12l3.54 3.54M6.34 17.66l3.54-3.54M14.12 9.88l3.54-3.54" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`,

  star: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l3 6 6.5 1-4.5 4.5 1 6.5L12 16.5 6 20l1-6.5L2.5 9 9 8l3-6z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  inbox: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="5" width="18" height="15" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <polyline points="3,9 12,16 21,9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M11 2h2v7h-2z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  layers: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  check: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 12l3 3 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  eye: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/>
  </svg>`,

  eye_off: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17.9 17.9A10.1 10.1 0 0022 12s-3-7-10-7a9.8 9.8 0 00-4.1.9M2 2l20 20" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M14.1 14.1a4 4 0 01-5.6-5.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </svg>`,

  export_icon: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3v12M7 8l5-5 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  x: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  stop: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/>
    <rect x="8" y="8" width="8" height="8" rx="2" fill="currentColor" opacity="0.6"/>
  </svg>`,

  cloud: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 18a4 4 0 01-.5-7.97A6 6 0 0118 8a4.5 4.5 0 010 9H7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  // --- 杂项 ---
  pickaxe: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 7l-4 4M16 3l5 5-4 4-5-5 4-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M14 8l-7 7-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  pencil: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 思考泡泡
  thought: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3a8 8 0 00-3.5 15.2V21l2.5-1.5A8 8 0 1012 3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="9" cy="11" r="1" fill="currentColor" opacity="0.4"/>
    <circle cx="12" cy="11" r="1" fill="currentColor" opacity="0.4"/>
    <circle cx="15" cy="11" r="1" fill="currentColor" opacity="0.4"/>
  </svg>`,

  // B站专属 TV+弹幕风格
  bilibili: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="5" width="20" height="13" rx="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M7 2l3 3M17 2l-3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M6 13h3M10 13h5M16 13h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  // 抖音音乐符号
  douyin: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 18a4 4 0 004-4V6h4v4a4 4 0 10-8 8z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  arrow_right: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // 手机拍照
  photo: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.8"/>
    <circle cx="12" cy="14" r="3" stroke="currentColor" stroke-width="1.8"/>
    <path d="M9 7h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // 语音波形
  voice_wave: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9v6M8 6v12M13 3v18M18 6v12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // 收起/最小化
  minimize: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`,

  // 诊断/听诊器
  stethoscope: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 3v5a4 4 0 008 0V3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M9 12v3a5 5 0 005 5 5 5 0 005-5v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="19" cy="8" r="2.5" stroke="currentColor" stroke-width="1.8"/>
  </svg>`,

  // 刷新/重置
  refresh: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12a9 9 0 0115.5-6.3L21 8M21 3v5h-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 12a9 9 0 01-15.5 6.3L3 16M3 21v-5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,

  // Obsidian 风格图标（宝石/水晶）
  obsidian: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 3l5 4-2 14L4 17V5l2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M18 3l-5 4 2 14 5-4V5l-2-2z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M6 3l5 4 7-4M11 7l2 14" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,
};
function glassIcon(name, size = 24, className = '') {
  const svg = ICONS[name];
  if (!svg) return `<span class="glass-icon glass-icon--fallback ${className}" style="width:${size}px;height:${size}px">?</span>`;

  // 注入 size 和 class
  return `<span class="glass-icon ${className}" style="width:${size}px;height:${size}px" aria-hidden="true">${svg}</span>`;
}

// ---------- 分类图标映射 ----------
const CATEGORY_ICON_MAP = {
  idea:    'lightbulb',
  note:    'document',
  pitfall: 'warning',
  todo:    'checklist',
  link:    'link',
  thought: 'thought',
};

// ---------- 平台图标映射 ----------
const SOURCE_ICON_MAP = {
  'bilibili.com':    'bilibili',
  'b23.tv':          'bilibili',
  'douyin.com':      'douyin',
  'iesdouyin.com':   'douyin',
  'youtube.com':     'play',
  'youtu.be':        'play',
  'zhihu.com':       'help',
  'weibo.com':       'bird',
  'xiaohongshu.com': 'book_closed',
  'xhslink.com':     'book_closed',
  'weixin.qq.com':   'message',
  'mp.weixin.qq.com':'message',
  'github.com':      'code',
  'twitter.com':     'bird',
  'x.com':           'bird',
  'juejin.cn':       'pickaxe',
  'csdn.net':        'document',
  'medium.com':      'pencil',
};

function getSourceIconName(hostname) {
  for (const [domain, icon] of Object.entries(SOURCE_ICON_MAP)) {
    if (hostname.includes(domain)) return icon;
  }
  return 'globe';
}
