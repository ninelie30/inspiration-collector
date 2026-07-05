// 坚果云 WebDAV 代理 - Cloudflare Pages Function
// 前端通过此函数代理与坚果云 WebDAV 通信，避免浏览器 CORS 限制

const DEFAULT_BASE = 'https://dav.jianguoyun.com/dav';
const FILE_PATH = '/inspiration-collector/data.json';
const DIR_PATH = '/inspiration-collector';

function baseUrl(server) {
  // 去掉尾部斜杠，统一格式
  return (server || DEFAULT_BASE).replace(/\/+$/, '');
}

function makeAuth(username, password) {
  return 'Basic ' + btoa(username + ':' + password);
}

async function ensureDir(base, auth) {
  // 尝试创建目录，已存在返回405，忽略即可
  try {
    await fetch(base + DIR_PATH, {
      method: 'MKCOL',
      headers: { Authorization: auth },
    });
  } catch (e) {
    // 忽略
  }
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

    // 测试连接
    if (action === 'test') {
      const testUrl = base + '/';
      try {
        const resp = await fetch(testUrl, {
          method: 'PROPFIND',
          headers: {
            Authorization: auth,
            Depth: '0',
          },
        });

        if (resp.status === 207 || resp.status === 200) {
          return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
        } else if (resp.status === 401 || resp.status === 403) {
          return new Response(JSON.stringify({ ok: false, error: '账号或密码错误' }), { status: 401, headers: corsHeaders });
        } else if (resp.status === 405) {
          return new Response(JSON.stringify({ ok: false, error: '服务器地址不正确，请检查坚果云WebDAV地址（设置→安全选项→第三方应用管理）' }), { status: 400, headers: corsHeaders });
        } else {
          return new Response(JSON.stringify({ ok: false, error: `服务器返回 HTTP ${resp.status}，请检查地址和账号是否正确` }), { status: 400, headers: corsHeaders });
        }
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: `无法连接服务器: ${e.message}。请检查地址是否正确` }), { status: 400, headers: corsHeaders });
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
