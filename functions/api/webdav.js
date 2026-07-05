// 坚果云 WebDAV 代理 - Cloudflare Pages Function
// 前端通过此函数代理与坚果云 WebDAV 通信，避免浏览器 CORS 限制

const DEFAULT_BASE = 'https://dav.jianguoyun.com/dav';
const FILE_PATH = '/inspiration-collector/data.json';
const DIR_PATH = '/inspiration-collector';

function baseUrl(server) {
  return (server || DEFAULT_BASE).replace(/\/+$/, '');
}

function makeAuth(username, password) {
  return 'Basic ' + btoa(username + ':' + password);
}

async function ensureDir(base, auth) {
  try {
    await fetch(base + DIR_PATH, {
      method: 'MKCOL',
      headers: { Authorization: auth },
    });
  } catch (e) { /* 目录已存在返回405，忽略 */ }
}

export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const body = await context.request.json();
    const { username, password, server, data } = body;

    if (!username || !password) {
      return new Response(JSON.stringify({ ok: false, error: '缺少账号或密码' }), { status: 400, headers: corsHeaders });
    }

    const auth = makeAuth(username, password);
    const base = baseUrl(server);
    const url = new URL(context.request.url);
    const action = url.pathname.replace('/api/webdav/', '');

    // 测试连接 — GET 数据文件（标准HTTP，避免 Cloudflare Workers 不支持 PROPFIND）
    if (action === 'test') {
      try {
        const resp = await fetch(base + FILE_PATH, {
          method: 'GET',
          headers: { Authorization: auth },
        });

        // 200=文件存在, 404=首次使用, 任何非401/403都说明认证通过
        if (resp.status === 401 || resp.status === 403) {
          return new Response(JSON.stringify({ ok: false, error: '账号或密码错误' }), { status: 401, headers: corsHeaders });
        }
        if (resp.status === 200 || resp.status === 404) {
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ ok: false, error: `服务器返回 HTTP ${resp.status}，请检查地址是否正确` }), { status: 400, headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: `无法连接服务器: ${e.message}` }), { status: 400, headers: corsHeaders });
      }
    }

    // 拉取数据
    if (action === 'pull') {
      const resp = await fetch(base + FILE_PATH, {
        method: 'GET',
        headers: { Authorization: auth },
      });

      if (resp.status === 404) {
        return new Response(JSON.stringify({ ok: true, data: null }), { headers: corsHeaders });
      }

      if (resp.status === 401) {
        return new Response(JSON.stringify({ ok: false, error: '账号或密码错误' }), { status: 401, headers: corsHeaders });
      }

      if (!resp.ok) {
        return new Response(JSON.stringify({ ok: false, error: `HTTP ${resp.status}` }), { status: 400, headers: corsHeaders });
      }

      const text = await resp.text();
      try {
        const cloudData = JSON.parse(text);
        return new Response(JSON.stringify({ ok: true, data: cloudData }), { headers: corsHeaders });
      } catch {
        return new Response(JSON.stringify({ ok: true, data: null }), { headers: corsHeaders });
      }
    }

    // 推送数据
    if (action === 'push') {
      if (!data) {
        return new Response(JSON.stringify({ ok: false, error: '缺少数据' }), { status: 400, headers: corsHeaders });
      }

      await ensureDir(base, auth);

      const resp = await fetch(base + FILE_PATH, {
        method: 'PUT',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (resp.status === 401) {
        return new Response(JSON.stringify({ ok: false, error: '账号或密码错误' }), { status: 401, headers: corsHeaders });
      }

      if (!resp.ok && resp.status !== 201 && resp.status !== 204) {
        return new Response(JSON.stringify({ ok: false, error: `上传失败 HTTP ${resp.status}` }), { status: 400, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: false, error: '未知操作: ' + action }), { status: 400, headers: corsHeaders });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
