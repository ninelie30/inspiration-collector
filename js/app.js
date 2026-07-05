/* ========================================
   灵感收藏家 - 应用逻辑
   ======================================== */

// ---------- 分类配置 ----------
const CATEGORIES = [
  { id: 'idea',    name: '灵感创意', icon: 'lightbulb', cls: 'cat-idea' },
  { id: 'note',    name: '学习笔记', icon: 'document',  cls: 'cat-note' },
  { id: 'pitfall', name: '避坑经验', icon: 'warning',   cls: 'cat-pitfall' },
  { id: 'todo',    name: '待办事项', icon: 'checklist', cls: 'cat-todo' },
  { id: 'link',    name: '网址链接', icon: 'link',      cls: 'cat-link' },
  { id: 'thought', name: '随想杂谈', icon: 'thought',   cls: 'cat-thought' },
];

// 自动分类关键词表
const CATEGORY_KEYWORDS = {
  idea:    ['想法','灵感','创意','点子','构思','设想','方案','如果','能不能','试试','idea'],
  note:    ['学习','笔记','知识','概念','原理','总结','理解','学到了','读书','课程','note'],
  pitfall: ['错误','坑','bug','失败','教训','踩坑','避免','问题','报错','反思','坑库','避坑'],
  todo:    ['待办','任务','要做','需要','计划','安排','记得','完成','todo','待做','提醒'],
  link:    ['http','https','www','链接','网址','网站','参考','来源','url','bilibili','b站','抖音','douyin','youtube','知乎','微博','小红书','微信'],
  thought: ['感觉','觉得','心情','开心','难过','感悟','突然','想到','回忆','随便'],
};

// ---------- 链接内容提取 ----------
// 已知平台的域名识别
const KNOWN_SOURCES = {
  'bilibili.com': { name: '哔哩哔哩', icon: 'bilibili', api: 'bilibili' },
  'b23.tv':       { name: '哔哩哔哩', icon: 'bilibili', api: 'bilibili' },
  'douyin.com':   { name: '抖音', icon: 'douyin', api: 'douyin' },
  'iesdouyin.com':{ name: '抖音', icon: 'douyin', api: 'douyin' },
  'youtube.com':  { name: 'YouTube', icon: 'play' },
  'youtu.be':     { name: 'YouTube', icon: 'play' },
  'zhihu.com':    { name: '知乎', icon: 'help' },
  'weibo.com':    { name: '微博', icon: 'bird' },
  'xiaohongshu.com': { name: '小红书', icon: 'book_closed' },
  'xhslink.com':  { name: '小红书', icon: 'book_closed' },
  'weixin.qq.com':{ name: '微信公众号', icon: 'message' },
  'mp.weixin.qq.com': { name: '微信公众号', icon: 'message' },
  'github.com':   { name: 'GitHub', icon: 'code' },
  'twitter.com':  { name: 'Twitter', icon: 'bird' },
  'x.com':        { name: 'X', icon: 'bird' },
  'juejin.cn':    { name: '掘金', icon: 'pickaxe' },
  'csdn.net':     { name: 'CSDN', icon: 'document' },
  'medium.com':   { name: 'Medium', icon: 'pencil' },
};

// 构建本地API的绝对URL（避免相对路径在SW缓存等场景下失效）
function apiUrl(path) {
  // 使用 window.location.origin 确保在主线程中正确获取origin
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
    || (typeof self !== 'undefined' && self.location && self.location.origin)
    || '';
  return `${origin}${path}`;
}

// 将图片URL通过本地代理转发（解决B站/抖音等防盗链 + HTTP混合内容问题）
function proxyImageUrl(url) {
  if (!url) return '';
  // 已经是本地代理或data URI，直接返回
  if (url.startsWith('data:') || url.includes('/api/image?')) return url;
  return apiUrl(`/api/image?url=${encodeURIComponent(url)}`);
}

// 带超时和重试的 fetch 封装
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    // cache: 'no-store' 确保不使用HTTP缓存，每次都发真实请求
    const resp = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    return resp;
  } finally {
    clearTimeout(timer);
  }
}

function detectSource(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    for (const [domain, info] of Object.entries(KNOWN_SOURCES)) {
      if (hostname.includes(domain)) return info;
    }
    return { name: hostname, icon: 'globe' };
  } catch {
    return { name: '网页', icon: 'globe' };
  }
}

// 提取URL（支持从抖音分享文本中提取）
function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s，。、！？）)】》"]+/);
  return match ? match[0] : null;
}

// === 代理策略 ===
// 本地服务器代理用相对路径，永远指向提供本页面的服务器，无需环境检测
// （只要页面是从 server.py 加载的，相对路径就自动正确）

// CORS 代理列表（HTML 抓取用，公共代理作为fallback）
const CORS_PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  (u) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

// 通过代理 fetch HTML（本地代理优先，公共代理fallback）
async function proxyFetch(targetUrl, timeout = 8000) {
  // 1. 优先用本地服务器代理（绝对URL，避免SW缓存导致相对路径失效）
  try {
    const resp = await fetchWithTimeout(apiUrl(`/api/proxy?url=${encodeURIComponent(targetUrl)}`), {}, timeout);
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.length > 50 && !text.startsWith('代理请求失败')) return text;
    }
  } catch (e) {
    // 本地代理失败，继续尝试公共代理
  }

  // 2. 公共代理fallback
  for (const proxy of CORS_PROXIES) {
    try {
      const resp = await fetchWithTimeout(proxy(targetUrl), {}, timeout);
      if (resp.ok) {
        const text = await resp.text();
        if (text && text.length > 50) return text;
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// 通过代理 fetch JSON（本地代理优先）
async function proxyFetchJson(targetUrl, timeout = 8000) {
  // 1. 本地代理直接返回原始JSON（绝对URL）
  try {
    const resp = await fetchWithTimeout(apiUrl(`/api/proxy?url=${encodeURIComponent(targetUrl)}`), {}, timeout);
    if (resp.ok) {
      const text = await resp.text();
      if (text && text.length > 10) {
        try { return JSON.parse(text); } catch {}
      }
    }
  } catch (e) {
    // 继续
  }

  // 2. allorigins /get 端点（JSON包装）
  const jsonProxies = [
    (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`,
  ];

  for (const proxy of jsonProxies) {
    try {
      const resp = await fetchWithTimeout(proxy(targetUrl), {}, timeout);
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || text.length < 10) continue;

      try {
        const wrapped = JSON.parse(text);
        if (wrapped.contents) {
          return JSON.parse(wrapped.contents);
        }
      } catch {
        // 可能不是包装格式，直接当JSON解析
      }
      try {
        return JSON.parse(text);
      } catch {
        continue;
      }
    } catch (e) {
      continue;
    }
  }
  return null;
}

// 错误页面检测
function isErrorPage(html, title) {
  const errorIndicators = [
    '出错啦', '出错了', '页面不存在', '404', '403', '访问被拒',
    '系统错误', '服务异常', '无法访问', '页面走丢了', '页面找不到了',
    'error-page', 'error_page', 'not found', 'access denied',
  ];
  const checkStr = (title || '').toLowerCase() + ' ' + html.substring(0, 3000).toLowerCase();
  return errorIndicators.some(e => checkStr.includes(e.toLowerCase()));
}

// ---- B站 API 提取 ----
function extractBvid(url) {
  // 匹配 BV1xxxxxx 或 bv1xxxxxx
  const m = url.match(/\/(BV[bB0-9a-zA-Z]{8,})/);
  return m ? m[1] : null;
}

async function fetchBilibiliMeta(url) {
  let bvid = extractBvid(url);
  const debugLog = [];

  // 如果是 b23.tv 短链，直接让服务端解析（服务端跟随重定向提取BV）
  if (!bvid && url.includes('b23.tv')) {
    try {
      const resp = await fetchWithTimeout(apiUrl(`/api/bilibili?url=${encodeURIComponent(url)}`), {}, 10000);
      if (resp.ok) {
        const data = await resp.json();
        if (data.code === 0 && data.data) {
          bvid = data.data.bvid || extractBvid(data.data.short_link || '');
          debugLog.push(`短链服务端解析: ✅ 成功 (BV: ${bvid || '?'})`);
          const meta = buildBilibiliMeta(data.data, url, bvid);
          meta._debug = debugLog.join('; ');
          return meta;
        }
      }
      debugLog.push(`短链服务端解析: HTTP ${resp.status}`);
    } catch (e) {
      debugLog.push(`短链服务端解析: ${e.message}`);
    }

    // Fallback: 代理抓取HTML提取BV
    const html = await proxyFetch(url, 5000);
    if (html) {
      const m = html.match(/bilibili\.com\/video\/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) bvid = m[1];
    }
    debugLog.push(`短链代理解析: ${bvid || '失败'}`);
  }

  if (!bvid) {
    debugLog.push('未提取到BV号');
    return { _debug: debugLog.join('; ') };
  }
  debugLog.push(`BV号: ${bvid}`);

  // === 方案1: 本地服务器 B站 API 代理（最可靠，绝对URL） ===
  try {
    const resp = await fetchWithTimeout(apiUrl(`/api/bilibili?bvid=${bvid}`), {}, 10000);
    if (resp.ok) {
      const data = await resp.json();
      if (data.code === 0 && data.data) {
        debugLog.push('方案1(本地代理): ✅ 成功');
        const meta = buildBilibiliMeta(data.data, url, bvid);
        meta._debug = debugLog.join('; ');
        return meta;
      }
      debugLog.push(`方案1(本地代理): code=${data.code}`);
    } else {
      debugLog.push(`方案1(本地代理): HTTP ${resp.status}`);
    }
  } catch (e) {
    debugLog.push(`方案1(本地代理): ${e.message}`);
  }

  // === 方案2: 直连B站 API ===
  const apiUrl2 = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
  try {
    const resp = await fetchWithTimeout(apiUrl2, {}, 8000);
    if (resp.ok) {
      const data = await resp.json();
      if (data.code === 0 && data.data) {
        debugLog.push('方案2(直连): ✅ 成功');
        const meta = buildBilibiliMeta(data.data, url, bvid);
        meta._debug = debugLog.join('; ');
        return meta;
      }
      debugLog.push(`方案2(直连): code=${data.code}`);
    } else {
      debugLog.push(`方案2(直连): HTTP ${resp.status}`);
    }
  } catch (e) {
    debugLog.push(`方案2(直连): ${e.message}`);
  }

  // === 方案3: 通过公共 JSON 代理调用B站 API ===
  const jsonData = await proxyFetchJson(apiUrl2, 8000);
  if (jsonData && jsonData.code === 0 && jsonData.data) {
    debugLog.push('方案3(公共JSON代理): ✅ 成功');
    const meta = buildBilibiliMeta(jsonData.data, url, bvid);
    meta._debug = debugLog.join('; ');
    return meta;
  }
  debugLog.push(`方案3(公共JSON代理): ${jsonData ? 'code!=' + jsonData.code : '无响应'}`);

  // === 方案4: 抓取B站视频页HTML ===
  const html = await proxyFetch(`https://www.bilibili.com/video/${bvid}`, 8000);
  if (html) {
    if (isErrorPage(html)) {
      debugLog.push('方案4(HTML): 错误页');
    } else {
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[^<]+\});/);
      if (stateMatch) {
        try {
          const state = JSON.parse(stateMatch[1]);
          const videoData = state.videoData || state?.videoInfo;
          if (videoData && videoData.title) {
            debugLog.push('方案4(__INITIAL_STATE__): ✅ 成功');
            const meta = buildBilibiliMeta(videoData, url, bvid);
            meta._debug = debugLog.join('; ');
            return meta;
          }
        } catch {}
      }

      const meta = parseHtmlMeta(html, url);
      if (meta && !isErrorPage('', meta.title)) {
        debugLog.push('方案4(OG标签): ✅ 成功');
        meta._debug = debugLog.join('; ');
        return meta;
      }
      debugLog.push('方案4(OG标签): 无有效数据');
    }
  } else {
    debugLog.push('方案4(HTML): 无响应');
  }

  return { _debug: debugLog.join('; ') };
}

// 构建 B站 元数据对象
function buildBilibiliMeta(d, url, bvid) {
  const desc = d.desc || '';
  const owner = d.owner ? d.owner.name : '';
  const stat = d.stat || {};
  const statText = [
    stat.view ? `播放${formatNum(stat.view)}` : '',
    stat.like ? `点赞${formatNum(stat.like)}` : '',
    stat.coin ? `投币${formatNum(stat.coin)}` : '',
    stat.favorite ? `收藏${formatNum(stat.favorite)}` : '',
  ].filter(Boolean).join(' · ');

  let description = desc;
  if (owner) description = `UP主: ${owner}` + (desc ? `\n${desc}` : '');
  if (statText) description += (description ? '\n' : '') + statText;

  return {
    title: d.title || '',
    description: description || '',
    image: d.pic || null,
    url: url,
    extra: {
      platform: 'bilibili',
      bvid: bvid,
      owner: owner,
      duration: d.duration || 0,
      stat: stat,
      tags: d.tag || '',
    },
  };
}

function formatNum(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

// ---- 抖音链接提取 ----
async function fetchDouyinMeta(url) {
  const debugLog = [];
  const douyinUrl = url; // 保留原始URL（可能是短链接）

  try {
    const resp = await fetchWithTimeout(apiUrl(`/api/douyin?url=${encodeURIComponent(douyinUrl)}`), {}, 20000);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      // 服务器返回了优雅降级数据（如抖音反爬限制）
      if (err.fallback && err.fallback.title) {
        return err.fallback;
      }
      debugLog.push(`服务器返回错误: ${err.error || resp.status}`);
      return { _debug: debugLog.join('; ') };
    }
    const data = await resp.json();
    if (data.error) {
      debugLog.push(`解析失败: ${data.error}`);
      return { _debug: debugLog.join('; ') };
    }
    if (data.title) {
      return {
        title: data.title,
        description: data.description || '',
        image: data.image || null,
        url: data.url || url,
        extra: {
          platform: 'douyin',
          video_id: data.video_id,
        },
      };
    }
  } catch (e) {
    debugLog.push(`请求异常: ${e.message}`);
  }

  // Fallback: 用通用代理尝试
  debugLog.push('尝试通用HTML抓取...');
  const html = await proxyFetch(douyinUrl, 10000);
  if (html && html.length > 100) {
    const meta = parseHtmlMeta(html, douyinUrl);
    if (meta && meta.title && meta.title.length > 2) {
      meta._debug = debugLog.join('; ');
      return meta;
    }
    debugLog.push('HTML中无有效OG标签');
  }

  return { _debug: debugLog.join('; ') };
}

// ---- 通用 HTML 元数据提取 ----
function parseHtmlMeta(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const getMeta = (selector) => {
    const el = doc.querySelector(selector);
    return el ? el.getAttribute('content') || el.textContent : null;
  };

  let title = getMeta('meta[property="og:title"]')
    || getMeta('meta[name="og:title"]')
    || doc.querySelector('title')?.textContent
    || '';

  let description = getMeta('meta[property="og:description"]')
    || getMeta('meta[name="og:description"]')
    || getMeta('meta[name="description"]')
    || '';

  let image = getMeta('meta[property="og:image"]')
    || getMeta('meta[name="og:image"]')
    || getMeta('meta[name="twitter:image"]')
    || doc.querySelector('img')?.src
    || null;

  if (image && image.startsWith('//')) {
    image = 'https:' + image;
  } else if (image && image.startsWith('/')) {
    try { image = new URL(url).origin + image; } catch {}
  }

  title = title.trim().replace(/\s+/g, ' ');
  description = description.trim().replace(/\s+/g, ' ');

  if (!title && !description) return null;
  return { title, description, image, url };
}

// ---- 主入口：根据平台选择提取方式 ----
async function fetchLinkPreview(url) {
  const source = detectSource(url);

  // B站走 API（含多种 fallback）
  if (source.api === 'bilibili') {
    const meta = await fetchBilibiliMeta(url);
    // 如果只有 _debug 没有 title，说明全部失败
    if (meta && meta.title) return meta;
    if (meta && meta._debug) return meta; // 返回带调试信息的"失败"对象
    return null;
  }

  // 抖音走服务器端 API（含短链接解析 + 多种fallback）
  if (source.api === 'douyin') {
    const meta = await fetchDouyinMeta(url);
    if (meta && meta.title) return meta;
    if (meta && meta._debug) return meta;
    return null;
  }

  // 通用 HTML 抓取
  const html = await proxyFetch(url);
  if (!html) return null;

  if (isErrorPage(html)) return null;

  const meta = parseHtmlMeta(html, url);
  if (meta && isErrorPage('', meta.title)) return null;
  return meta;
}

// ---------- DeepSeek API 集成 ----------
const SETTINGS_KEY = 'inspiration_settings';

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function getApiKey() {
  return getSettings().deepseekApiKey || '';
}

function isAiEnabled() {
  const s = getSettings();
  return s.aiEnabled !== false && !!s.deepseekApiKey;
}

function isBatchSummaryEnabled() {
  const s = getSettings();
  return s.batchSummaryEnabled === true;
}

function isObsidianEnabled() {
  const s = getSettings();
  return s.obsidianEnabled === true;
}

// ---------- 批量总结系统提示词 ----------
const SUMMARY_SYSTEM_PROMPT = `你是一名专业的内容分析助手。
基于内容提炼高价值信息，不要复述内容，不要输出思考过程或 think 标签。
优先输出：主题与核心观点、关键数据与事实、逻辑链路与重要结论、可执行建议。
回答应结构化、信息密度高、便于收藏和复习，可适当使用 Emoji、列表和表格。
自动过滤广告、废话和重复表达。
信息不足时明确说明，不得猜测或编造；涉及专业内容时，区分事实、数据、推测与作者观点。`;

// ---------- 批量总结状态 ----------
let isSummaryMode = false;
let isExportMode = false;
let selectedIds = new Set();
let lastSummaryResult = '';

// ---------- Obsidian 导出 ----------

// 将单条灵感格式化为 Markdown
function inspirationToMarkdown(item) {
  const cat = getCategory(item.category);
  const date = new Date(item.createdAt);
  const dateStr = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const title = getInspirationTitle(item);

  let md = '---\n';
  md += `title: "${title.replace(/"/g, '\\"')}"\n`;
  md += `source: 灵感收藏家\n`;
  md += `category: ${cat.name}\n`;
  md += `type: ${item.type || 'text'}\n`;
  if (item.isSummary) md += `is_summary: true\n`;
  if (item.linkMeta && item.linkMeta.url) md += `url: ${item.linkMeta.url}\n`;
  md += `created: ${dateStr}\n`;
  md += `tags:\n  - 灵感收藏家\n  - ${cat.name}\n`;
  md += '---\n\n';

  md += `# ${title}\n\n`;

  // 正文内容
  md += `${item.content || ''}\n`;

  // 链接元数据
  if (item.linkMeta) {
    const meta = item.linkMeta;
    const source = detectSource(meta.url);
    md += `\n## 🔗 链接信息\n`;
    md += `- **平台**: ${source.name}\n`;
    md += `- **标题**: ${meta.title || '(无标题)'}\n`;
    if (meta.description) md += `- **描述**: ${meta.description}\n`;
    md += `- **链接**: ${meta.url}\n`;
    if (meta.image) md += `- **封面**: ${meta.image}\n`;
  }

  // AI 摘要
  if (item.aiSummary) {
    md += `\n## ✨ AI 摘要\n${item.aiSummary}\n`;
  }

  return md;
}

// 从灵感中提取标题（取前30字）
function getInspirationTitle(item) {
  if (item.linkMeta && item.linkMeta.title) return item.linkMeta.title;
  const content = (item.content || '').trim();
  if (!content) {
    if (item.type === 'voice') return '语音记录';
    if (item.type === 'image') return '图片记录';
    if (item.isSummary) return 'AI 总结';
    return '无标题灵感';
  }
  const firstLine = content.split('\n')[0];
  return firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine;
}

// 生成 Obsidian 笔记文件名（不含扩展名）
function generateObsidianFileName(item) {
  const date = new Date(item.createdAt);
  const datePart = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const title = getInspirationTitle(item).replace(/[\\/:*?"<>|]/g, '_').substring(0, 20);
  return `${datePart}_${title}`;
}

// 构建完整的 Obsidian 文件路径
function buildObsidianFilePath(fileName) {
  const s = getSettings();
  const folder = (s.obsidianFolder || '').trim();
  return folder ? `${folder}/${fileName}` : fileName;
}

// 构建 Obsidian URI
function buildObsidianUri(filePath, content) {
  const s = getSettings();
  const vault = (s.obsidianVault || '').trim();
  let uri = 'obsidian://new?';
  if (vault) uri += `vault=${encodeURIComponent(vault)}&`;
  uri += `file=${encodeURIComponent(filePath)}`;
  uri += `&content=${encodeURIComponent(content)}`;
  return uri;
}

// 单条导出到 Obsidian
function exportToObsidian(id) {
  const s = getSettings();
  if (!s.obsidianEnabled) {
    toast('请先在设置中启用 Obsidian 导出');
    return;
  }

  const data = getData();
  const item = data.find(d => d.id === id);
  if (!item) return;

  const md = inspirationToMarkdown(item);
  const fileName = generateObsidianFileName(item);
  const filePath = buildObsidianFilePath(fileName);
  const uri = buildObsidianUri(filePath, md);

  // 检查 URI 长度，超长则 fallback 到下载
  if (uri.length > 8000) {
    downloadMarkdown(md, fileName + '.md');
    toast('内容较长，已下载 .md 文件，可手动导入 Obsidian');
    return;
  }

  // 通过 location.href 触发 Obsidian URI
  window.location.href = uri;

  // 2秒后如果仍在页面，提示可能未安装 Obsidian
  setTimeout(() => {
    toast('已尝试打开 Obsidian，如未跳转请确认已安装 App');
  }, 2000);
}

// 批量导出到 Obsidian（合并为一条笔记）
function batchExportToObsidian() {
  const s = getSettings();
  if (!s.obsidianEnabled) {
    toast('请先在设置中启用 Obsidian 导出');
    return;
  }
  if (selectedIds.size === 0) return;

  const data = getData();
  const items = data.filter(d => selectedIds.has(d.id));
  if (items.length === 0) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // 合并 Markdown
  let md = '---\n';
  md += `title: "灵感合集 ${dateStr}"\n`;
  md += `source: 灵感收藏家\n`;
  md += `created: ${now.toISOString()}\n`;
  md += `count: ${items.length}\n`;
  md += `tags:\n  - 灵感收藏家\n  - 批量导出\n`;
  md += '---\n\n';
  md += `# 灵感合集 ${dateStr}\n\n`;
  md += `> 共 ${items.length} 条灵感，导出于 ${now.toLocaleString('zh-CN')}\n\n`;

  items.forEach((item, i) => {
    const cat = getCategory(item.category);
    md += `---\n\n`;
    md += `## ${i+1}. ${getInspirationTitle(item)}\n\n`;
    md += `**分类**: ${glassIconStr(cat.icon)} ${cat.name} | **时间**: ${new Date(item.createdAt).toLocaleString('zh-CN')} | **类型**: ${item.type || 'text'}\n\n`;
    md += `${item.content || ''}\n`;

    if (item.linkMeta) {
      const meta = item.linkMeta;
      const source = detectSource(meta.url);
      md += `\n**🔗 ${source.name}**: [${meta.title || '(无标题)'}](${meta.url})\n`;
      if (meta.description) md += `> ${meta.description}\n`;
    }

    if (item.aiSummary) {
      md += `\n**✨ AI摘要**: ${item.aiSummary}\n`;
    }
  });

  const fileName = `灵感合集_${dateStr}`;
  const filePath = buildObsidianFilePath(fileName);
  const uri = buildObsidianUri(filePath, md);

  if (uri.length > 8000) {
    downloadMarkdown(md, fileName + '.md');
    toast(`内容较长（${items.length}条），已下载 .md 文件`);
    return;
  }

  window.location.href = uri;
  setTimeout(() => {
    toast(`已导出 ${items.length} 条到 Obsidian`);
  }, 500);
}

// 纯文本图标名（用于 Markdown 中，不用 HTML）
function glassIconStr(name) {
  return name;
}

// 下载 Markdown 文件
function downloadMarkdown(content, fileName) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 批量下载 Markdown（单条一个文件，打包下载）
function batchDownloadMarkdown() {
  if (selectedIds.size === 0) return;

  const data = getData();
  const items = data.filter(d => selectedIds.has(d.id));
  if (items.length === 0) return;

  if (items.length === 1) {
    const md = inspirationToMarkdown(items[0]);
    downloadMarkdown(md, generateObsidianFileName(items[0]) + '.md');
    toast('已下载 1 个 Markdown 文件');
    return;
  }

  // 多条合并为一个文件
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  let md = `# 灵感合集 ${dateStr}\n\n> 共 ${items.length} 条灵感\n\n`;
  items.forEach((item, i) => {
    md += `\n---\n\n## ${i+1}. ${getInspirationTitle(item)}\n\n${inspirationToMarkdown(item)}\n`;
  });

  downloadMarkdown(md, `灵感合集_${dateStr}.md`);
  toast(`已下载 ${items.length} 条灵感的 Markdown 文件`);
}

// 导出模式切换
function toggleExportMode() {
  // 如果总结模式开着，先关掉
  if (isSummaryMode) toggleSummaryMode();

  isExportMode = !isExportMode;
  selectedIds = new Set();

  const btn = document.getElementById('export-mode-btn');
  const banner = document.getElementById('export-banner');
  const bar = document.getElementById('export-bar');

  if (isExportMode) {
    btn.classList.add('export-active');
    banner.style.display = 'flex';
    bar.style.display = 'none';
  } else {
    btn.classList.remove('export-active');
    banner.style.display = 'none';
    bar.style.display = 'none';
  }

  renderLibrary();
  updateExportBar();
}

// 更新导出底部栏
function updateExportBar() {
  const bar = document.getElementById('export-bar');
  const countEl = document.getElementById('export-bar-count');
  const mdBtn = document.getElementById('export-bar-md-btn');
  const obsidianBtn = document.getElementById('export-bar-obsidian-btn');

  if (!isExportMode) {
    bar.style.display = 'none';
    return;
  }

  const count = selectedIds.size;
  if (count > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `已选 ${count} 条`;
    mdBtn.disabled = false;
    obsidianBtn.disabled = !isObsidianEnabled();
  } else {
    bar.style.display = 'none';
    mdBtn.disabled = true;
    obsidianBtn.disabled = true;
  }
}

// Obsidian 设置保存
function saveObsidianSettings() {
  const s = getSettings();
  s.obsidianEnabled = document.getElementById('setting-obsidian-enabled').checked;
  s.obsidianVault = document.getElementById('setting-obsidian-vault').value.trim();
  s.obsidianFolder = document.getElementById('setting-obsidian-folder').value.trim();
  saveSettings(s);

  const statusEl = document.getElementById('obsidian-status');
  statusEl.textContent = '✅ 设置已保存';
  statusEl.style.color = 'var(--primary)';
  setTimeout(() => { statusEl.textContent = ''; }, 3000);

  toast('Obsidian 设置已保存');
  renderSettings();
}

// 测试 Obsidian URI 连接
function testObsidianUri() {
  const uri = 'obsidian://new?vault=Test&file=灵感收藏家测试&content=' + encodeURIComponent('# 测试\n\n如果你看到这条笔记，说明 Obsidian 连接正常！\n\n来自：灵感收藏家 PWA');
  window.location.href = uri;
  setTimeout(() => {
    const statusEl = document.getElementById('obsidian-status');
    statusEl.textContent = '💡 如果 Obsidian 未打开，请确认：\n1. 已安装 Obsidian App\n2. 手机已设为允许打开 obsidian:// 链接';
    statusEl.style.color = 'var(--text-tertiary)';
  }, 2000);
}

// 调用 DeepSeek Chat API
async function deepseekChat(messages, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: messages,
        max_tokens: options.maxTokens || 500,
        temperature: options.temperature ?? 0.3,
        stream: false,
      }),
      signal: (() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), options.timeout || 15000);
        return controller.signal;
      })(),
    });

    if (!resp.ok) {
      console.error('DeepSeek API error:', resp.status, await resp.text());
      return null;
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error('DeepSeek API call failed:', e);
    return null;
  }
}

// AI 语义分类
async function aiCategorize(text) {
  if (!isAiEnabled() || !text.trim()) return null;

  const prompt = `请分析以下内容，从这6个分类中选择最合适的一个，只返回分类ID（不加任何其他文字）：

分类列表：
- idea: 灵感创意（新想法、创意点子、构思）
- note: 学习笔记（知识、学习心得、总结）
- pitfall: 避坑经验（踩坑、错误、教训、问题排查）
- todo: 待办事项（计划、任务、需要做的事）
- link: 网址链接（分享的链接、网址、参考资料）
- thought: 随想杂谈（心情、感悟、日常随想）

内容："${text.slice(0, 500)}"

只返回分类ID（idea/note/pitfall/todo/link/thought）：`;

  const result = await deepseekChat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 10, temperature: 0.1 }
  );

  if (!result) return null;
  const cat = result.trim().toLowerCase();
  return CATEGORIES.some(c => c.id === cat) ? cat : null;
}

// AI 内容摘要（用于链接内容分析）
async function aiSummarize(meta) {
  if (!isAiEnabled() || !meta) return null;

  const content = `标题：${meta.title || ''}
描述：${meta.description || ''}
${meta.extra?.owner ? '作者：' + meta.extra.owner : ''}
${meta.extra?.stat ? '数据：播放' + (meta.extra.stat.view || 0) + ' 点赞' + (meta.extra.stat.like || 0) : ''}`;

  const prompt = `请分析以下网页内容，生成一个简洁的中文摘要（2-3句话），提炼核心价值点。如果是视频，说明视频讲什么；如果是文章，说明文章要点。只返回摘要内容，不要加其他格式：

${content}`;

  const result = await deepseekChat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 200, temperature: 0.3 }
  );

  return result ? result.trim() : null;
}

// 测试 API 连接
async function testApiKey(apiKey) {
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 5,
      }),
      signal: (() => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 10000);
        return controller.signal;
      })(),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ---------- 批量总结 ----------
function toggleSummaryMode() {
  const apiKey = getApiKey();
  if (!apiKey) {
    toast('请先在设置中配置 DeepSeek API Key');
    return;
  }
  if (!isBatchSummaryEnabled()) {
    toast('请先在设置中启用"AI批量总结"');
    return;
  }

  // 如果导出模式开着，先关掉
  if (isExportMode) toggleExportMode();

  isSummaryMode = !isSummaryMode;
  selectedIds = new Set();

  const btn = document.getElementById('summary-mode-btn');
  const banner = document.getElementById('summary-banner');
  const bar = document.getElementById('summary-bar');
  const result = document.getElementById('summary-result');

  if (isSummaryMode) {
    btn.classList.add('active');
    banner.style.display = 'flex';
    bar.style.display = 'none';
  } else {
    btn.classList.remove('active');
    banner.style.display = 'none';
    bar.style.display = 'none';
  }

  // 关闭已有结果
  if (result.style.display !== 'none') {
    result.style.display = 'none';
  }

  renderLibrary();
  updateSummaryBar();
}

function toggleCardSelection(id) {
  if (!isSummaryMode && !isExportMode) return;

  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }

  // 更新卡片 UI（局部刷新选中态）
  document.querySelectorAll('.inspiration-card').forEach(card => {
    const cardId = card.dataset.id;
    if (cardId === id) {
      card.classList.toggle('selected', selectedIds.has(cardId));
    }
  });

  updateSummaryBar();
  updateExportBar();
}

function updateSummaryBar() {
  const bar = document.getElementById('summary-bar');
  const countEl = document.getElementById('summary-bar-count');
  const btnEl = document.getElementById('summary-bar-btn');

  if (!isSummaryMode) {
    bar.style.display = 'none';
    return;
  }

  const count = selectedIds.size;
  if (count > 0) {
    bar.style.display = 'flex';
    countEl.textContent = `已选 ${count} 条`;
    btnEl.disabled = false;
  } else {
    bar.style.display = 'none';
    btnEl.disabled = true;
  }
}

async function generateBatchSummary() {
  if (selectedIds.size === 0) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    toast('请先配置 DeepSeek API Key');
    return;
  }

  const data = getData();
  const selectedItems = data.filter(item => selectedIds.has(item.id));
  if (selectedItems.length === 0) return;

  // 构建内容输入
  const contentBlocks = selectedItems.map((item, idx) => {
    const cat = getCategory(item.category);
    let text = `[${idx + 1}] 【${cat.name}】${item.content || ''}`;
    if (item.linkMeta) {
      text += `\n  链接标题：${item.linkMeta.title || ''}`;
      text += `\n  链接描述：${item.linkMeta.description || ''}`;
    }
    if (item.aiSummary) {
      text += `\n  原始AI摘要：${item.aiSummary}`;
    }
    return text;
  }).join('\n\n');

  const userPrompt = `请对以下${selectedItems.length}条灵感内容进行整体总结和分析：\n\n${contentBlocks}`;

  // 显示 loading
  const resultEl = document.getElementById('summary-result');
  const bodyEl = document.getElementById('summary-result-body');
  resultEl.style.display = 'block';
  bodyEl.innerHTML = `
    <div class="summary-result__loading">
      <div class="link-preview__spinner"></div>
      <span>AI 正在分析 ${selectedItems.length} 条灵感...</span>
    </div>`;

  // 隐藏操作按钮
  document.querySelector('.summary-result__actions').style.display = 'none';

  // 滚动到结果区域
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const summary = await deepseekChat(
    [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 2000, temperature: 0.3, timeout: 60000 }
  );

  if (summary) {
    lastSummaryResult = summary;
    bodyEl.innerHTML = markedToHtml(summary);
    document.querySelector('.summary-result__actions').style.display = 'flex';
    // 隐藏底部选择栏，避免遮挡保存按钮
    document.getElementById('summary-bar').style.display = 'none';
    document.getElementById('summary-banner').style.display = 'none';
    toast('AI 总结完成');
  } else {
    bodyEl.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-tertiary);">
        <p>总结生成失败，请检查 API Key 或网络连接后重试</p>
      </div>`;
  }
}

// 简单的 Markdown → HTML 转换（用于总结结果展示）
function markedToHtml(text) {
  // 先转义 HTML，防止 XSS 注入
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, (match) => {
    if (match.includes('<ul>')) return match;
    return '<ol>' + match + '</ol>';
  });

  // 段落（用换行分隔连续的非标签文本）
  html = html.split('\n\n').map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.match(/^<(h[23]|ul|ol|table)/)) return trimmed;
    return '<p>' + trimmed.replace(/\n/g, '<br>') + '</p>';
  }).join('\n');

  // 简单表格支持
  html = html.replace(/^\|(.+)\|[\s\S]*?\n/gm, (match) => {
    const lines = match.trim().split('\n').filter(l => !l.includes('---'));
    const rows = lines.map(l => {
      const cells = l.split('|').filter(c => c.trim()).map(c => c.trim());
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
    });
    if (rows.length > 1) {
      const thead = '<thead>' + rows[0].replace(/td>/g, 'th>') + '</thead>';
      const tbody = '<tbody>' + rows.slice(1).join('') + '</tbody>';
      return '<table>' + thead + tbody + '</table>';
    }
    return match;
  });

  return html;
}

function closeSummaryResult() {
  document.getElementById('summary-result').style.display = 'none';
  lastSummaryResult = '';
}

function copySummaryResult() {
  if (!lastSummaryResult) return;
  const ta = document.createElement('textarea');
  ta.value = lastSummaryResult;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    toast('总结已复制到剪贴板');
  } catch (e) {
    toast('复制失败，请手动选择文本复制');
  }
  document.body.removeChild(ta);
}

async function saveSummaryAsInspiration() {
  if (!lastSummaryResult) return;

  const item = {
    id: 'sum_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type: 'text',
    content: lastSummaryResult,
    image: null,
    linkMeta: null,
    aiSummary: null,
    category: 'note',
    createdAt: Date.now(),
    isSummary: true,
    sourceIds: [...selectedIds],
  };

  const data = getData();
  data.push(item);
  saveData(data);

  toast('总结已保存到灵感库');
  closeSummaryResult();

  // 退出总结模式
  isSummaryMode = false;
  selectedIds = new Set();
  document.getElementById('summary-mode-btn').classList.remove('active');
  document.getElementById('summary-banner').style.display = 'none';
  document.getElementById('summary-bar').style.display = 'none';
  renderLibrary();
}

// ---------- 链接预览 UI（记录页） ----------
let currentLinkMeta = null;
let linkPreviewTimer = null;

function onTextInputChange(text) {
  // 关键词分类（即时）
  if (text.trim().length > 3) {
    const suggested = autoCategorize(text);
    if (suggested && !selectedCategory) {
      const cat = getCategory(suggested);
      document.getElementById('text-category-hint').innerHTML =
        `${glassIcon('sparkle', 14)} 检测到 <b style="color:var(--primary)">${glassIcon(cat.icon, 14)} ${cat.name}</b>，已自动选中`;
      selectedCategory = suggested;
      renderCategoryChips();
    }
  } else {
    document.getElementById('text-category-hint').textContent = '输入内容后将自动推荐分类';
  }

  // AI 语义分类（异步，覆盖关键词结果）
  if (isAiEnabled() && text.trim().length > 5 && !selectedCategory) {
    aiCategorize(text).then(aiCat => {
      if (aiCat && !selectedCategory) {
        const cat = getCategory(aiCat);
        document.getElementById('text-category-hint').innerHTML =
          `${glassIcon('sparkle', 14)} AI分析: <b style="color:var(--primary)">${glassIcon(cat.icon, 14)} ${cat.name}</b>`;
        selectedCategory = aiCat;
        renderCategoryChips();
      }
    });
  }

  // 链接检测与预览
  const url = extractUrl(text);
  if (url) {
    if (!selectedCategory) {
      selectedCategory = 'link';
      renderCategoryChips();
      document.getElementById('text-category-hint').innerHTML =
        `${glassIcon('link', 14)} 检测到链接，已归类为 <b style="color:var(--primary)">${glassIcon('link', 14)} 网址链接</b>`;
    }

    clearTimeout(linkPreviewTimer);
    linkPreviewTimer = setTimeout(() => triggerLinkPreview(url), 600);
  } else {
    hideLinkPreview();
  }
}

async function triggerLinkPreview(url) {
  const previewEl = document.getElementById('link-preview');
  const loadingEl = previewEl.querySelector('.link-preview__loading');
  const cardEl = document.getElementById('link-preview-card');

  previewEl.style.display = 'block';
  loadingEl.style.display = 'flex';
  cardEl.style.display = 'none';
  document.getElementById('link-preview-status').textContent = '正在解析链接内容...';

  try {
    const meta = await fetchLinkPreview(url);

    // 全部方案都失败
    if (!meta || (!meta.title && !meta.description)) {
      let hint = '无法解析此链接';
      if (meta && meta._debug) {
        // B站/抖音失败，显示调试信息帮助定位
        hint = '解析失败：' + meta._debug;
        // 如果本地代理失败，提示用户去设置页诊断
        if (meta._debug.includes('Failed to fetch') || meta._debug.includes('无响应')) {
          hint += '\n💡 提示：请到「设置 → 链接解析诊断」运行诊断，检查服务器连接状态';
        }
      } else if (detectSource(url).api === 'bilibili') {
        hint = 'B站链接解析失败。链接仍会保存';
        hint += '\n💡 请到「设置 → 链接解析诊断」检查';
      } else {
        hint = '无法解析此链接（可能需要登录或限制访问）。链接仍会保存';
      }
      document.getElementById('link-preview-status').textContent = hint;
      currentLinkMeta = null;
      document.getElementById('link-preview-ai').style.display = 'none';
      return;
    }
    currentLinkMeta = meta;

    // 渲染预览卡片
    const source = detectSource(url);
    loadingEl.style.display = 'none';
    cardEl.style.display = 'flex';

    const imgEl = document.getElementById('link-preview-img');
    if (meta.image) {
      imgEl.src = proxyImageUrl(meta.image);
      imgEl.style.display = 'block';
    } else {
      imgEl.style.display = 'none';
    }

    document.getElementById('link-preview-source').innerHTML = `${glassIcon(source.icon, 14)} ${source.name}`;
    document.getElementById('link-preview-title').textContent = meta.title || '(无标题)';
    document.getElementById('link-preview-desc').textContent = meta.description || '';

    // AI 摘要
    const aiSummaryEl = document.getElementById('link-preview-ai');
    if (isAiEnabled()) {
      aiSummaryEl.style.display = 'block';
      aiSummaryEl.querySelector('.link-preview__ai-text').textContent = 'AI 正在分析内容...';
      const summary = await aiSummarize(meta);
      if (summary) {
        currentLinkMeta.aiSummary = summary;
        aiSummaryEl.querySelector('.link-preview__ai-text').textContent = summary;
      } else {
        aiSummaryEl.style.display = 'none';
      }
    } else {
      aiSummaryEl.style.display = 'none';
    }

  } catch (e) {
    document.getElementById('link-preview-status').textContent = '链接解析失败，将仅保存链接文本';
    currentLinkMeta = null;
  }
}

function hideLinkPreview() {
  document.getElementById('link-preview').style.display = 'none';
  currentLinkMeta = null;
  clearTimeout(linkPreviewTimer);
}

// 每日反思问题
const REFLECT_QUESTIONS = [
  { title: '今天什么事让你记忆犹新？', placeholder: '记录今天印象最深的一件事...' },
  { title: '哪个错误值得记入"避坑库"？', placeholder: '今天踩了什么坑，以后怎么避免...' },
  { title: '如果重来，我会优化哪一步？', placeholder: '回顾今天，哪个环节可以做得更好...' },
];

// ---------- 数据存储 ----------
const STORAGE_KEY = 'inspiration_data';
const REFLECT_KEY = 'reflection_data';
const STREAK_KEY = 'streak_data';

function getData() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  // 触发云同步推送（sync.js 中定义，不存在则跳过）
  if (typeof triggerSyncPush === 'function') triggerSyncPush();
}

function getReflections() {
  try {
    return JSON.parse(localStorage.getItem(REFLECT_KEY)) || [];
  } catch { return []; }
}

function saveReflections(data) {
  localStorage.setItem(REFLECT_KEY, JSON.stringify(data));
  if (typeof triggerSyncPush === 'function') triggerSyncPush();
}

function getStreak() {
  try {
    return JSON.parse(localStorage.getItem(STREAK_KEY)) || { count: 0, lastDate: null };
  } catch { return { count: 0, lastDate: null }; }
}

function saveStreak(streak) {
  localStorage.setItem(STREAK_KEY, JSON.stringify(streak));
  if (typeof triggerSyncPush === 'function') triggerSyncPush();
}

// ---------- 工具函数 ----------
function formatDate(date) {
  const d = new Date(date);
  const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
  const days = ['周日','周一','周二','周三','周四','周五','周六'];
  return `${months[d.getMonth()]}${d.getDate()}日 ${days[d.getDay()]}`;
}

function formatDateFull(date) {
  const d = new Date(date);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

function timeAgo(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const min = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;
  return formatDate(timestamp);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let _toastTimer = null;

function toast(msg) {
  const el = document.getElementById('toast');
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
  el.textContent = msg;
  !el.classList.contains('show') && el.classList.add('show');
  _toastTimer = setTimeout(() => {
    el.classList.remove('show');
    _toastTimer = null;
  }, 2200);
}

function getCategory(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[5];
}

// ---------- 自动分类 ----------
function autoCategorize(text) {
  if (!text || !text.trim()) return null;
  const lower = text.toLowerCase();
  const scores = {};
  for (const [catId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    scores[catId] = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        scores[catId] += kw.length >= 4 ? 2 : 1; // 长关键词权重更高
      }
    }
  }
  let best = null;
  let maxScore = 0;
  for (const [catId, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      best = catId;
    }
  }
  return maxScore > 0 ? best : null;
}

// ---------- 页面切换 ----------
function switchPage(pageName) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${pageName}`).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === pageName);
  });

  // 离开灵感库时自动退出总结模式
  if (pageName !== 'library' && isSummaryMode) {
    isSummaryMode = false;
    selectedIds = new Set();
    const btn = document.getElementById('summary-mode-btn');
    if (btn) btn.classList.remove('active');
    document.getElementById('summary-banner').style.display = 'none';
    document.getElementById('summary-bar').style.display = 'none';
  }

  // 刷新页面数据
  if (pageName === 'home') renderHome();
  if (pageName === 'library') renderLibrary();
  if (pageName === 'reflect') renderReflect();
  if (pageName === 'capture') resetCapturePage();
  if (pageName === 'settings') renderSettings();
}

// ---------- 首页渲染 ----------
function renderHome() {
  // 日期
  document.getElementById('home-date').textContent = formatDate(new Date());

  const data = getData();
  // 统计
  document.getElementById('stat-total').textContent = data.length;
  const weekAgo = Date.now() - 7 * 86400000;
  document.getElementById('stat-week').textContent = data.filter(d => d.createdAt >= weekAgo).length;

  // 连续天数
  const streak = getStreak();
  document.getElementById('stat-streak').textContent = streak.count;

  // 反思提醒
  const reflections = getReflections();
  const todayReflect = reflections.find(r => r.date === todayKey());
  const reminderCard = document.getElementById('reminder-card');
  if (todayReflect) {
    reminderCard.classList.add('done');
    reminderCard.querySelector('h3').textContent = '今日反思已完成';
    reminderCard.querySelector('p').textContent = '坚持记录，持续成长';
    reminderCard.querySelector('button').textContent = '查看';
  } else {
    reminderCard.classList.remove('done');
    reminderCard.querySelector('h3').textContent = '今日反思未完成';
    reminderCard.querySelector('p').textContent = '每天3个小问题，记录成长轨迹';
    reminderCard.querySelector('button').textContent = '去完成';
  }

  // 最近灵感（取5条）
  const recent = [...data].sort((a,b) => b.createdAt - a.createdAt).slice(0, 5);
  const listEl = document.getElementById('home-recent-list');
  if (recent.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:32px 20px;">
        <span class="empty-state__icon">${glassIcon('sparkle', 48)}</span>
        <p>点击下方"记录"按钮，开始收藏你的灵感</p>
      </div>`;
  } else {
    listEl.innerHTML = recent.map(item => renderCard(item)).join('');
  }
}

// ---------- 渲染灵感卡片 ----------
function renderCard(item, opts = {}) {
  const cat = getCategory(item.category);
  // 总结模式或导出模式都可选择
  const selectable = (isSummaryMode || isExportMode) && opts.selectable !== false;
  let contentHtml = '';

  if (item.type === 'voice') {
    contentHtml = `<div style="display:flex;align-items:center;gap:6px;color:var(--primary);font-size:13px;margin-bottom:4px;">${glassIcon('mic', 14)} 语音记录</div>${escapeHtml(item.content)}`;
  } else if (item.type === 'image') {
    contentHtml = item.content ? escapeHtml(item.content) : `<span style="color:var(--text-tertiary);font-size:13px;">${glassIcon('photo', 14)} 图片记录</span>`;
    if (item.image) {
      contentHtml += `<img class="inspiration-card__image" src="${item.image}" alt="">`;
    }
  } else if (item.isSummary) {
    // AI 总结：使用 markedToHtml 保留 Markdown 排版（emoji、标题、列表等）
    contentHtml = '<div class="inspiration-card__summary">' + markedToHtml(item.content) + '</div>';
  } else {
    // 检测链接
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const text = escapeHtml(item.content);
    const linked = text.replace(urlRegex, '<a href="$1" target="_blank" style="color:var(--primary);">$1</a>');
    contentHtml = linked;

    // 如果有链接元数据，渲染富预览卡片
    if (item.linkMeta) {
      const meta = item.linkMeta;
      const source = detectSource(meta.url);
      const imgHtml = meta.image
        ? `<img class="inspiration-link-card__img" src="${proxyImageUrl(meta.image)}" alt="" onerror="this.style.display='none'">`
        : '';
      const aiSummaryHtml = item.aiSummary
        ? `<div class="inspiration-link-card__ai">${glassIcon('sparkle', 14)} ${escapeHtml(item.aiSummary)}</div>`
        : '';
      contentHtml += `
        <a class="inspiration-link-card" href="${escapeHtml(meta.url)}" target="_blank">
          ${imgHtml}
          <div class="inspiration-link-card__body">
            <div class="inspiration-link-card__source">${glassIcon(source.icon, 14)} ${escapeHtml(source.name)}</div>
            <div class="inspiration-link-card__title">${escapeHtml(meta.title || '(无标题)')}</div>
            <div class="inspiration-link-card__desc">${escapeHtml(meta.description || '')}</div>
          </div>
        </a>${aiSummaryHtml}`;
    }
  }

  // 导出模式下隐藏卡片操作栏
  const showActions = !selectable;
  const obsidianBtn = isObsidianEnabled()
    ? `<button class="inspiration-card__action inspiration-card__action--obsidian" onclick="event.stopPropagation(); exportToObsidian('${item.id}')">${glassIcon('obsidian', 13)} Obsidian</button>`
    : '';

  return `
    <div class="inspiration-card ${selectable ? 'selectable' : ''} ${selectable && selectedIds.has(item.id) ? 'selected' : ''}" data-id="${item.id}" onclick="${selectable ? `toggleCardSelection('${item.id}')` : ''}">
      <div class="inspiration-card__type ${cat.cls}-bar"></div>
      <div class="inspiration-card__head">
        <span class="inspiration-card__category ${cat.cls}">${glassIcon(cat.icon, 14)} ${cat.name}${item.isSummary ? ' · 总结' : ''}</span>
      </div>
      <div class="inspiration-card__content">${contentHtml}</div>
      <div class="inspiration-card__footer">
        <span class="inspiration-card__time">${timeAgo(item.createdAt)}</span>
      </div>
      ${showActions ? `<div class="inspiration-card__actions">
        <button class="inspiration-card__action" onclick="event.stopPropagation(); copyContent('${item.id}')">${glassIcon('copy', 13)} 复制</button>
        <button class="inspiration-card__action" onclick="event.stopPropagation(); shareContent('${item.id}')">${glassIcon('share', 13)} 分享</button>
        ${obsidianBtn}
        <button class="inspiration-card__action" onclick="event.stopPropagation(); deleteInspiration('${item.id}')" style="margin-left:auto;color:#FF6B6B;">${glassIcon('trash', 13)} 删除</button>
      </div>` : ''}
    </div>`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---------- 灵感库渲染 ----------
let currentFilter = 'all';
let currentSearch = '';

function renderLibrary() {
  const data = getData();
  let filtered = [...data].sort((a,b) => b.createdAt - a.createdAt);

  if (currentFilter !== 'all') {
    if (currentFilter === 'summary') {
      filtered = filtered.filter(d => d.isSummary);
    } else {
      filtered = filtered.filter(d => d.category === currentFilter);
    }
  }
  if (currentSearch) {
    const q = currentSearch.toLowerCase();
    filtered = filtered.filter(d => d.content && d.content.toLowerCase().includes(q));
  }

  const listEl = document.getElementById('library-list');
  const emptyEl = document.getElementById('library-empty');

  if (filtered.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    if (currentSearch || currentFilter !== 'all') {
      emptyEl.querySelector('p').textContent = '没有找到匹配的灵感';
    } else {
      emptyEl.querySelector('p').textContent = '还没有灵感，去记录第一个吧！';
    }
  } else {
    emptyEl.style.display = 'none';
    listEl.innerHTML = filtered.map(item => renderCard(item, { selectable: true })).join('');
  }

  // 渲染筛选标签
  renderFilterChips();

  // 同步总结模式 UI 状态
  updateSummaryBar();
}

function renderFilterChips() {
  const container = document.getElementById('filter-chips');
  const data = getData();
  let html = `<button class="filter-chip ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">${glassIcon('layers', 13)} 全部 ${data.length}</button>`;

  // AI 总结标签（有总结内容时才显示）
  const summaryCount = data.filter(d => d.isSummary).length;
  if (summaryCount > 0 || currentFilter === 'summary') {
    html += `<button class="filter-chip ${currentFilter === 'summary' ? 'active' : ''}" data-filter="summary">${glassIcon('sparkle', 13)} AI总结 ${summaryCount}</button>`;
  }

  for (const cat of CATEGORIES) {
    const count = data.filter(d => d.category === cat.id).length;
    if (count > 0 || cat.id === currentFilter) {
      html += `<button class="filter-chip ${currentFilter === cat.id ? 'active' : ''}" data-filter="${cat.id}">${glassIcon(cat.icon, 13)} ${cat.name} ${count}</button>`;
    }
  }
  container.innerHTML = html;
  container.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      renderLibrary();
    });
  });
}

// ---------- 快速记录 ----------
let selectedCategory = null;
let currentImage = null;
let voiceRecognition = null;
let isRecording = false;
let voiceTranscript = '';

function resetCapturePage() {
  // 重置分类选择
  selectedCategory = null;
  currentImage = null;
  currentLinkMeta = null;
  voiceTranscript = '';
  clearTimeout(linkPreviewTimer);
  document.getElementById('capture-text-input').value = '';
  document.getElementById('image-desc-input').value = '';
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('image-preview-img').src = '';
  document.getElementById('voice-result').style.display = 'none';
  document.getElementById('voice-result').textContent = '';
  document.getElementById('text-category-hint').textContent = '输入内容后将自动推荐分类';
  document.getElementById('link-preview').style.display = 'none';
  document.getElementById('link-preview-card').style.display = 'none';
  renderCategoryChips();
}

function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  container.innerHTML = CATEGORIES.map(cat => `
    <button class="category-chip ${selectedCategory === cat.id ? 'selected' : ''}" data-cat="${cat.id}">
      ${glassIcon(cat.icon, 15)} ${cat.name}
    </button>
  `).join('');
  container.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      selectedCategory = chip.dataset.cat;
      renderCategoryChips();
    });
  });
}

// 标签切换
document.querySelectorAll('.capture-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.capture-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.capture-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add('active');
    // 如果切到语音以外，停止录音
    if (tab.dataset.tab !== 'voice' && isRecording) {
      stopVoiceRecording();
    }
  });
});

// 文字输入自动分类 + 链接检测
document.getElementById('capture-text-input').addEventListener('input', (e) => {
  onTextInputChange(e.target.value);
});

// 图片上传
document.getElementById('image-input').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentImage = ev.target.result;
    document.getElementById('image-preview-img').src = currentImage;
    document.getElementById('image-preview').style.display = 'block';
  };
  reader.readAsDataURL(file);
});

function removeImage() {
  currentImage = null;
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('image-input').value = '';
}

// 语音识别
function initVoiceRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('voice-hint').textContent = '当前浏览器不支持语音识别，请使用文字输入';
    document.getElementById('voice-btn').disabled = true;
    document.getElementById('voice-btn').style.opacity = '0.5';
    return null;
  }
  const recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    let finalChunk = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalChunk += transcript;
      } else {
        interim += transcript;
      }
    }
    // 累积已确认结果，避免 continuous 模式下覆盖丢失
    if (finalChunk) {
      voiceTranscript += finalChunk;
    }
    const display = voiceTranscript || interim;
    const resultEl = document.getElementById('voice-result');
    resultEl.style.display = 'block';
    resultEl.textContent = display;
  };

  recognition.onerror = (event) => {
    console.error('语音识别错误:', event.error);
    let msg = '语音识别出错';
    if (event.error === 'not-allowed') msg = '请允许麦克风权限';
    if (event.error === 'no-speech') msg = '没有检测到语音，请重试';
    document.getElementById('voice-hint').textContent = msg;
  };

  recognition.onend = () => {
    if (isRecording) {
      // 自动重启（保持连续识别）
      try { recognition.start(); } catch {}
    } else {
      stopVoiceRecording();
    }
  };

  return recognition;
}

document.getElementById('voice-btn').addEventListener('click', () => {
  if (!voiceRecognition) {
    voiceRecognition = initVoiceRecognition();
    if (!voiceRecognition) return;
  }
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
});

function startVoiceRecording() {
  isRecording = true;
  voiceTranscript = '';
  voiceRecognition.start();
  document.getElementById('voice-btn').classList.add('recording');
  document.getElementById('voice-btn').querySelector('.voice-btn__icon').innerHTML = glassIcon('stop', 28);
  document.getElementById('voice-hint').textContent = '正在聆听... 再次点击结束';
  document.getElementById('voice-wave').style.display = 'flex';
  document.getElementById('voice-result').style.display = 'none';
}

function stopVoiceRecording() {
  isRecording = false;
  if (voiceRecognition) {
    try { voiceRecognition.stop(); } catch {}
  }
  document.getElementById('voice-btn').classList.remove('recording');
  document.getElementById('voice-btn').querySelector('.voice-btn__icon').innerHTML = glassIcon('mic', 28);
  document.getElementById('voice-hint').textContent = voiceTranscript ? '识别完成，可继续录音或保存' : '点击开始语音输入';
  document.getElementById('voice-wave').style.display = 'none';
}

// 保存灵感
async function saveInspiration() {
  const activeTab = document.querySelector('.capture-tab.active').dataset.tab;
  let content = '';
  let type = 'text';
  let image = null;

  if (activeTab === 'text') {
    content = document.getElementById('capture-text-input').value.trim();
    type = 'text';
  } else if (activeTab === 'voice') {
    content = voiceTranscript.trim();
    type = 'voice';
    if (!content) {
      toast('请先录制语音内容');
      return;
    }
  } else if (activeTab === 'image') {
    content = document.getElementById('image-desc-input').value.trim();
    image = currentImage;
    type = 'image';
    if (!image) {
      toast('请先选择一张图片');
      return;
    }
  }

  if (!content && !image) {
    toast('内容不能为空');
    return;
  }

  // 自动分类（如果用户未手动选）
  let category = selectedCategory;
  if (!category) {
    // 优先用 AI 分类
    if (isAiEnabled()) {
      const aiCat = await aiCategorize(content);
      category = aiCat || autoCategorize(content) || 'thought';
    } else {
      category = autoCategorize(content) || 'thought';
    }
  }

  const item = {
    id: 'ins_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    type,
    content,
    image,
    linkMeta: currentLinkMeta || null,
    aiSummary: currentLinkMeta?.aiSummary || null,
    category,
    createdAt: Date.now(),
  };

  const data = getData();
  data.push(item);
  saveData(data);

  toast('灵感已保存');
  resetCapturePage();
  setTimeout(() => switchPage('home'), 600);
}

// ---------- 删除 / 复制 / 分享 ----------
function deleteInspiration(id) {
  if (!confirm('确定删除这条灵感吗？')) return;
  let data = getData();
  data = data.filter(d => d.id !== id);
  saveData(data);
  selectedIds.delete(id); // 清理选中状态
  // 记录删除用于云同步
  if (typeof recordDeletion === 'function') recordDeletion(id);
  toast('已删除');
  renderHome();
  renderLibrary();
}

function copyContent(id) {
  const data = getData();
  const item = data.find(d => d.id === id);
  if (!item) return;
  const text = item.content || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板'));
  } else {
    // 降级方案
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('已复制到剪贴板');
  }
}

function shareContent(id) {
  const data = getData();
  const item = data.find(d => d.id === id);
  if (!item) return;
  const text = item.content || '分享一条灵感';
  if (navigator.share) {
    navigator.share({
      title: '灵感收藏家',
      text: text,
    }).catch(() => {});
  } else {
    copyContent(id);
    toast('已复制内容，可粘贴到其他App分享');
  }
}

// ---------- 每日反思 ----------
function renderReflect() {
  document.getElementById('reflect-date').textContent = formatDateFull(new Date());

  // 渲染问题
  const reflections = getReflections();
  const todayReflect = reflections.find(r => r.date === todayKey());

  const questionsHtml = REFLECT_QUESTIONS.map((q, i) => {
    const savedAnswer = todayReflect ? todayReflect.answers[i] || '' : '';
    return `
      <div class="reflect-question">
        <span class="reflect-question__num">${i + 1}</span>
        <h3 class="reflect-question__title">${q.title}</h3>
        <textarea class="reflect-question__input" id="reflect-q-${i}" placeholder="${q.placeholder}" rows="3" data-idx="${i}">${escapeHtml(savedAnswer)}</textarea>
      </div>`;
  }).join('');
  document.getElementById('reflect-questions').innerHTML = questionsHtml;

  // 渲染历史
  const history = [...reflections].sort((a,b) => b.date.localeCompare(a.date)).slice(1, 10);
  const historyEl = document.getElementById('reflect-history');
  if (history.length === 0) {
    historyEl.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;text-align:center;padding:20px;">还没有历史反思记录</p>';
  } else {
    historyEl.innerHTML = history.map(r => `
      <div class="reflect-history-item">
        <div class="reflect-history-item__date">${formatDateFull(r.date)}</div>
        ${REFLECT_QUESTIONS.map((q, i) => `
          <div class="reflect-history-item__q">${q.title}</div>
          <div class="reflect-history-item__a">${escapeHtml(r.answers[i] || '—')}</div>
        `).join('')}
      </div>
    `).join('');
  }
}

function saveReflection() {
  const answers = REFLECT_QUESTIONS.map((_, i) => {
    return document.getElementById(`reflect-q-${i}`).value.trim();
  });

  const hasContent = answers.some(a => a.length > 0);
  if (!hasContent) {
    toast('至少回答一个问题');
    return;
  }

  const reflections = getReflections();
  const today = todayKey();
  const existingIdx = reflections.findIndex(r => r.date === today);

  const entry = { date: today, answers, createdAt: Date.now() };
  if (existingIdx >= 0) {
    reflections[existingIdx] = entry;
  } else {
    reflections.push(entry);
  }
  saveReflections(reflections);

  // 更新连续天数
  updateStreak();

  toast('今日反思已保存');
  setTimeout(() => switchPage('home'), 800);
}

function updateStreak() {
  const streak = getStreak();
  const today = todayKey();
  const yesterday = new Date(Date.now() - 86400000);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;

  if (streak.lastDate === today) {
    // 今天已记录，不重复计算
    return;
  }
  if (streak.lastDate === yesterdayKey) {
    streak.count += 1;
  } else {
    streak.count = 1;
  }
  streak.lastDate = today;
  saveStreak(streak);
}

// ---------- 搜索 ----------
document.getElementById('search-input').addEventListener('input', (e) => {
  currentSearch = e.target.value.trim();
  renderLibrary();
});

// ---------- 接收分享（Web Share Target API） ----------
window.addEventListener('load', () => {
  init();
});

// 接收来自其他App分享的文本
function handleSharedContent() {
  const params = new URLSearchParams(window.location.search);
  const sharedText = params.get('text') || params.get('title') || params.get('url');
  if (sharedText) {
    switchPage('capture');
    setTimeout(() => {
      document.querySelector('.capture-tab[data-tab="text"]').click();
      const textarea = document.getElementById('capture-text-input');
      textarea.value = sharedText;
      // 直接触发输入事件，会自动检测链接并提取预览
      onTextInputChange(sharedText);
    }, 300);
  }
}

// ---------- 设置页面 ----------
function renderSettings() {
  const s = getSettings();
  document.getElementById('setting-ai-enabled').checked = s.aiEnabled !== false;
  document.getElementById('setting-batch-summary').checked = s.batchSummaryEnabled === true;
  document.getElementById('setting-api-key').value = s.deepseekApiKey || '';
  // Obsidian 设置
  document.getElementById('setting-obsidian-enabled').checked = s.obsidianEnabled === true;
  document.getElementById('setting-obsidian-vault').value = s.obsidianVault || '';
  document.getElementById('setting-obsidian-folder').value = s.obsidianFolder || '';
  const engineEl = document.getElementById('settings-ai-engine');

  // 显示当前页面地址（帮助诊断连接问题）
  const urlEl = document.getElementById('settings-page-url');
  if (urlEl) {
    urlEl.textContent = window.location.href;
    if (window.location.protocol === 'file:') {
      urlEl.style.color = 'var(--danger)';
      urlEl.textContent += ' ⚠️ 应通过 http://localhost:8080 访问';
    }
  }

  // 更新总结模式按钮状态
  const summaryBtn = document.getElementById('summary-mode-btn');
  if (summaryBtn) {
    if (!s.deepseekApiKey || s.batchSummaryEnabled !== true) {
      summaryBtn.classList.add('paused');
      summaryBtn.title = !s.deepseekApiKey ? '请先配置API Key' : '请在设置中启用AI批量总结';
    } else {
      summaryBtn.classList.remove('paused');
      summaryBtn.title = '';
    }
  }

  if (s.deepseekApiKey) {
    engineEl.textContent = 'DeepSeek (已配置)';
    engineEl.style.color = 'var(--primary)';
  } else {
    engineEl.textContent = '未配置';
    engineEl.style.color = 'var(--text-tertiary)';
  }

  // 更新云同步UI
  if (typeof updateSyncUI === 'function') updateSyncUI();
}

function toggleApiKeyVisibility() {
  const input = document.getElementById('setting-api-key');
  const btn = document.getElementById('api-key-toggle-btn');
  input.type = input.type === 'password' ? 'text' : 'password';
  const iconName = input.type === 'password' ? 'eye' : 'eye_off';
  btn.innerHTML = glassIcon(iconName, 20);
}

async function testApiConnection() {
  const apiKey = document.getElementById('setting-api-key').value.trim();
  const statusEl = document.getElementById('api-key-status');
  const btn = document.getElementById('test-api-btn');

  if (!apiKey) {
    statusEl.textContent = '请先输入 API Key';
    statusEl.className = 'api-key-status api-key-status--error';
    return;
  }

  btn.textContent = '测试中...';
  btn.disabled = true;
  statusEl.textContent = '正在连接 DeepSeek API...';
  statusEl.className = 'api-key-status api-key-status--info';

  const ok = await testApiKey(apiKey);
  if (ok) {
    statusEl.textContent = '连接成功！API Key 有效';
    statusEl.className = 'api-key-status api-key-status--success';
  } else {
    statusEl.textContent = '连接失败，请检查 API Key 是否正确';
    statusEl.className = 'api-key-status api-key-status--error';
  }
  btn.textContent = '测试连接';
  btn.disabled = false;
}

function saveApiKey() {
  const apiKey = document.getElementById('setting-api-key').value.trim();
  const aiEnabled = document.getElementById('setting-ai-enabled').checked;
  const s = getSettings();
  s.deepseekApiKey = apiKey;
  s.aiEnabled = aiEnabled;
  saveSettings(s);

  const statusEl = document.getElementById('api-key-status');
  statusEl.textContent = '设置已保存';
  statusEl.className = 'api-key-status api-key-status--success';
  renderSettings();
  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

// AI 开关变化时自动保存
document.getElementById('setting-ai-enabled')?.addEventListener('change', (e) => {
  const s = getSettings();
  s.aiEnabled = e.target.checked;
  saveSettings(s);
});

// 批量总结开关变化时自动保存
document.getElementById('setting-batch-summary')?.addEventListener('change', (e) => {
  const s = getSettings();
  s.batchSummaryEnabled = e.target.checked;
  saveSettings(s);
  renderSettings(); // 更新按钮状态
});

// Obsidian 开关变化时自动保存
document.getElementById('setting-obsidian-enabled')?.addEventListener('change', (e) => {
  const s = getSettings();
  s.obsidianEnabled = e.target.checked;
  saveSettings(s);
  renderLibrary(); // 刷新卡片显示/隐藏 Obsidian 按钮
});

function exportData() {
  const data = {
    inspirations: getData(),
    reflections: getReflections(),
    streak: getStreak(),
    deletedIds: getDeletedIds(),
    settings: getSettings(),
    exportDate: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `灵感收藏家_导出_${todayKey()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('数据已导出');
}

function clearAllData() {
  if (!confirm('确定清空所有灵感、反思和设置吗？此操作不可撤销！')) return;
  if (!confirm('再次确认：所有数据将被永久删除！')) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(REFLECT_KEY);
  localStorage.removeItem(STREAK_KEY);
  localStorage.removeItem(SETTINGS_KEY);
  localStorage.removeItem(WEBDAV_SETTINGS_KEY);
  localStorage.removeItem(DELETED_IDS_KEY);
  localStorage.removeItem('sw_version');
  toast('所有数据已清空');
  setTimeout(() => location.reload(), 1000);
}

// ---------- 链接解析诊断 ----------
async function runLinkDiagnostic() {
  const resultEl = document.getElementById('diagnostic-result');
  resultEl.style.display = 'block';
  resultEl.textContent = '正在诊断...';

  const lines = [];
  const origin = window.location.origin;
  lines.push(`📋 诊断报告`);
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`页面地址: ${window.location.href}`);
  lines.push(`页面协议: ${window.location.protocol}`);
  lines.push(`Origin: ${origin}`);
  lines.push('');

  // 1. 检测SW状态
  lines.push(`🔧 Service Worker 状态:`);
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      lines.push(`  注册数量: ${regs.length}`);
      for (const reg of regs) {
        lines.push(`  SW scope: ${reg.scope}`);
        lines.push(`  SW active: ${reg.active ? reg.active.scriptURL : '无'}`);
      }
      lines.push(`  controller: ${navigator.serviceWorker.controller ? '有' : '无'}`);
    } catch (e) {
      lines.push(`  获取SW信息失败: ${e.message}`);
    }
  } else {
    lines.push(`  浏览器不支持SW`);
  }
  lines.push('');

  // 2. 检测缓存
  lines.push(`📦 Cache Storage:`);
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      lines.push(`  缓存数量: ${keys.length}`);
      for (const key of keys) {
        lines.push(`  - ${key}`);
      }
    } catch (e) {
      lines.push(`  获取缓存失败: ${e.message}`);
    }
  } else {
    lines.push(`  浏览器不支持Cache API`);
  }
  lines.push('');

  // 3. 测试本地API连通性
  lines.push(`🌐 API 连通性测试:`);
  const testUrl = apiUrl('/api/bilibili?bvid=BV1hAEG6eEDk');
  lines.push(`  请求URL: ${testUrl}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(testUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    lines.push(`  HTTP状态: ${resp.status} ${resp.statusText}`);
    lines.push(`  Content-Type: ${resp.headers.get('content-type')}`);
    lines.push(`  CORS头: ${resp.headers.get('access-control-allow-origin') || '无'}`);
    if (resp.ok) {
      const data = await resp.json();
      lines.push(`  ✅ API响应正常! 标题: ${data.data?.title || '(无标题)'}`);
    } else {
      lines.push(`  ❌ HTTP错误: ${resp.status}`);
    }
  } catch (e) {
    lines.push(`  ❌ 请求失败: ${e.name}: ${e.message}`);
    if (e.name === 'AbortError') {
      lines.push(`  ⚠️ 请求超时（10秒无响应）`);
    }
    lines.push(`  ⚠️ 这说明浏览器无法连接到本地服务器`);
    lines.push(`  可能原因:`);
    lines.push(`  1. 页面不是通过 http://localhost:8080 打开的`);
    lines.push(`  2. Service Worker 拦截了请求`);
    lines.push(`  3. 浏览器安全策略阻止了请求`);
    lines.push(`  4. 服务器已停止运行`);
  }
  lines.push('');

  // 4. 测试抖音API
  lines.push(`🎵 抖音API测试:`);
  const douyinUrl = apiUrl('/api/douyin?url=https://v.douyin.com/C9feODQa5j4/');
  lines.push(`  请求URL: ${douyinUrl}`);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const resp = await fetch(douyinUrl, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timer);
    lines.push(`  HTTP状态: ${resp.status}`);
    if (resp.ok) {
      const data = await resp.json();
      lines.push(`  ✅ 抖音API响应正常! 标题: ${data.title || '(无标题)'}`);
    } else {
      const text = await resp.text();
      lines.push(`  ❌ HTTP错误: ${resp.status}, ${text.substring(0, 100)}`);
    }
  } catch (e) {
    lines.push(`  ❌ 请求失败: ${e.name}: ${e.message}`);
  }

  resultEl.textContent = lines.join('\n');
}

// 强制重置应用（清除SW + 缓存 + 刷新）
async function forceResetApp() {
  if (!confirm('确定要强制重置应用吗？这将清除Service Worker和所有缓存，但不会删除你的灵感数据。')) return;

  // 1. 注销所有SW
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const reg of regs) {
      await reg.unregister();
      console.log('[Reset] 已注销SW:', reg.scope);
    }
  }

  // 2. 清除所有缓存
  if ('caches' in window) {
    const keys = await caches.keys();
    for (const key of keys) {
      await caches.delete(key);
      console.log('[Reset] 已清除缓存:', key);
    }
  }

  // 3. 清除SW版本标记
  localStorage.removeItem('sw_version');

  // 4. 刷新页面
  toast('应用已重置，正在刷新...');
  setTimeout(() => window.location.reload(), 1000);
}

// ---------- 图标初始化 ----------
// 替换所有 data-icon 元素为 SVG
function initIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const sizeAttr = el.getAttribute('data-icon-size');
    const size = sizeAttr ? parseInt(sizeAttr) : 22;
    const existing = el.querySelector('.glass-icon');
    if (existing) return; // 已初始化
    const svg = ICONS[name];
    if (!svg) return;
    const hasText = el.textContent.trim().length > 0;
    el.insertAdjacentHTML('afterbegin', svg);
    el.classList.add('glass-icon');
    // 仅纯图标元素设固定尺寸，带文字的按钮不限制
    if (!hasText) {
      el.style.width = size + 'px';
      el.style.height = size + 'px';
    }
    el.removeAttribute('data-icon');
    el.removeAttribute('data-icon-size');
  });
}

// ---------- 初始化 ----------
function init() {
  initIcons();
  renderHome();
  renderCategoryChips();
  handleSharedContent();

  // 初始化云同步
  if (typeof initSync === 'function') initSync();

  // 注册Service Worker（支持自动更新 + 强制重置旧版本）
  if ('serviceWorker' in navigator) {
    // 强制清理旧版SW和缓存（解决旧SW拦截API请求的问题）
    navigator.serviceWorker.getRegistrations().then(async (registrations) => {
      const CURRENT_SW_VERSION = 'v19';
      const storedVersion = localStorage.getItem('sw_version');

      // 如果版本不匹配，注销所有旧SW并清除缓存
      if (storedVersion !== CURRENT_SW_VERSION && registrations.length > 0) {
        console.log('[SW] 检测到版本变化，强制重置:', storedVersion, '->', CURRENT_SW_VERSION);
        for (const reg of registrations) {
          await reg.unregister();
        }
        // 清除所有缓存
        if ('caches' in window) {
          const keys = await caches.keys();
          for (const key of keys) {
            await caches.delete(key);
          }
        }
        localStorage.setItem('sw_version', CURRENT_SW_VERSION);
        // 刷新页面以确保新SW生效
        window.location.reload();
        return;
      }

      localStorage.setItem('sw_version', CURRENT_SW_VERSION);

      // 正常注册
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                window.location.reload();
              }
            });
          }
        });
      }).catch(err => {
        console.log('SW注册失败:', err);
      });
    }).catch(err => {
      console.log('SW检查失败:', err);
    });
  }
}
