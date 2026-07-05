// 云同步 API — Cloudflare Pages Function (KV 存储)
// 端点：
//   POST /api/sync/create  → 创建新同步码，返回空数据
//   GET  /api/sync?code=XX → 拉取云端数据
//   POST /api/sync         → 推送数据到云端 { code, inspirations, reflections, streak, deletedIds }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function generateCode() {
  // 去掉易混淆字符 (0/O, 1/I/L)
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // 创建新同步码
  if (url.pathname.endsWith('/create')) {
    const code = generateCode();
    const payload = {
      inspirations: [],
      reflections: [],
      streak: { count: 0, lastDate: null },
      deletedIds: [],
      lastModified: Date.now(),
    };

    try {
      await env.INSPIRATION_KV.put(`sync:${code}`, JSON.stringify(payload));
    } catch (e) {
      return json({ error: 'KV写入失败，请检查KV绑定: ' + e.message }, 500);
    }

    return json({ code, ...payload });
  }

  // 推送数据
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '无效的JSON' }, 400);
  }

  const { code, inspirations, reflections, streak, deletedIds } = body;
  if (!code) return json({ error: '缺少同步码' }, 400);

  // 读取现有数据用于合并（而非直接覆盖）
  let existing = { inspirations: [], reflections: [], streak: { count: 0, lastDate: null }, deletedIds: [] };
  try {
    const raw = await env.INSPIRATION_KV.get(`sync:${code}`);
    if (raw) existing = JSON.parse(raw);
  } catch {}

  // 合并灵感（按ID去重，最新优先）
  const inspMap = new Map();
  for (const item of (existing.inspirations || [])) inspMap.set(item.id, item);
  for (const item of (inspirations || [])) {
    const ex = inspMap.get(item.id);
    if (!ex || (item._modifiedAt || item.createdAt || 0) >= (ex._modifiedAt || ex.createdAt || 0)) {
      inspMap.set(item.id, item);
    }
  }

  // 合并反思（按date去重，最新优先）
  const reflMap = new Map();
  for (const item of (existing.reflections || [])) reflMap.set(item.date, item);
  for (const item of (reflections || [])) {
    const ex = reflMap.get(item.date);
    if (!ex || (item.createdAt || 0) >= (ex.createdAt || 0)) {
      reflMap.set(item.date, item);
    }
  }

  // 合并连续天数（取最大值）
  const exStreak = existing.streak || { count: 0, lastDate: null };
  const newStreak = streak || { count: 0, lastDate: null };
  const mergedStreak = {
    count: Math.max(exStreak.count || 0, newStreak.count || 0),
    lastDate: newStreak.lastDate || exStreak.lastDate,
  };

  // 合并删除ID
  const mergedDeleted = [...new Set([...(existing.deletedIds || []), ...(deletedIds || [])])];

  // 过滤掉已删除的灵感
  const deletedSet = new Set(mergedDeleted);
  const mergedInspirations = [...inspMap.values()].filter(i => !deletedSet.has(i.id));

  const payload = {
    inspirations: mergedInspirations,
    reflections: [...reflMap.values()],
    streak: mergedStreak,
    deletedIds: mergedDeleted,
    lastModified: Date.now(),
  };

  try {
    await env.INSPIRATION_KV.put(`sync:${code}`, JSON.stringify(payload));
  } catch (e) {
    return json({ error: 'KV写入失败: ' + e.message }, 500);
  }

  return json({ success: true, lastModified: payload.lastModified, count: mergedInspirations.length });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) return json({ error: '缺少同步码' }, 400);

  let raw;
  try {
    raw = await env.INSPIRATION_KV.get(`sync:${code}`);
  } catch (e) {
    return json({ error: 'KV读取失败，请检查KV绑定: ' + e.message }, 500);
  }

  if (!raw) return json({ error: '同步码不存在', notFound: true }, 404);

  const payload = JSON.parse(raw);
  return json({ code, ...payload });
}

export function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}
