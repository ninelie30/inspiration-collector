// 坚果云 WebDAV 代理 - Cloudflare Pages Function (动态路由)
// 匹配 /api/webdav/test, /api/webdav/pull, /api/webdav/push
// context.params.action 自动获取 URL 中的 action 参数

const DEFAULT_BASE = 'https://dav.jianguoyun.com/dav';
const FILE_PATH = '/inspiration-collector/data.json';
const DIR_PATH = '/inspiration-collector';

function baseUrl(server) {
  return (server || DEFAULT_BASE).replace(/\/+$/, '');
}

function makeAuth(username, password) {
  return 'Basic ' + btoa(username + ':' + password);
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() },
  });
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
  try {
    const body = await context.request.json();
    const { username, password, server, data } = body;
    const action = context.params.action; // 'test' | 'pull' | 'push'

    if (!username || !password) {
      return jsonResponse({ ok: false, error: '缺少账号或密码' }, 400);
    }

    const auth = makeAuth(username, password);
    const base = baseUrl(server);

    // === 测试连接 ===
    if (action === 'test') {
      try {
        const resp = await fetch(base + FILE_PATH, {
          method: 'GET',
          headers: { Authorization: auth },
        });

        // 200=文件存在, 404=首次使用(文件不存在), 405=方法不允许但认证通过
        // 任何非401/403响应都说明连接和认证正常
        if (resp.status === 401 || resp.status === 403) {
          return jsonResponse({ ok: false, error: '账号或密码错误' }, 401);
        }
        if (resp.status === 200 || resp.status === 404 || resp.status === 405) {
          return jsonResponse({ ok: true });
        }
        return jsonResponse({ ok: false, error: `服务器返回 HTTP ${resp.status}，请检查地址是否正确` }, 400);
      } catch (e) {
        return jsonResponse({ ok: false, error: `无法连接服务器: ${e.message}` }, 400);
      }
    }

    // === 拉取数据 ===
    if (action === 'pull') {
      const resp = await fetch(base + FILE_PATH, {
        method: 'GET',
        headers: { Authorization: auth },
      });

      // 404=文件不存在(首次使用), 405=方法不允许也视为不存在
      if (resp.status === 404 || resp.status === 405) {
        return jsonResponse({ ok: true, data: null });
      }

      if (resp.status === 401) {
        return jsonResponse({ ok: false, error: '账号或密码错误' }, 401);
      }

      if (!resp.ok) {
        return jsonResponse({ ok: false, error: `HTTP ${resp.status}` }, 400);
      }

      const text = await resp.text();
      try {
        const cloudData = JSON.parse(text);
        return jsonResponse({ ok: true, data: cloudData });
      } catch {
        return jsonResponse({ ok: true, data: null });
      }
    }

    // === 推送数据 ===
    if (action === 'push') {
      if (!data) {
        return jsonResponse({ ok: false, error: '缺少数据' }, 400);
      }

      // 确保目录存在（已存在返回405，忽略）
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
        return jsonResponse({ ok: false, error: '账号或密码错误' }, 401);
      }

      if (resp.ok || resp.status === 201 || resp.status === 204) {
        return jsonResponse({ ok: true });
      }

      return jsonResponse({ ok: false, error: `上传失败 HTTP ${resp.status}` }, 400);
    }

    return jsonResponse({ ok: false, error: '未知操作: ' + action }, 400);

  } catch (e) {
    return jsonResponse({ ok: false, error: e.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}
