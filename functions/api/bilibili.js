// B站视频信息 API — Cloudflare Pages Function
// 支持 bvid 直接传入，也支持 url 参数（b23.tv短链自动解析）
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bvid = url.searchParams.get("bvid");
  const urlParam = url.searchParams.get("url");

  let finalBvid = bvid;

  // 如果传了 url 而不是 bvid，尝试从 URL 提取 BV
  if (!finalBvid && urlParam) {
    // 先尝试直接从URL提取
    const m = urlParam.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) {
      finalBvid = m[1];
    }
    // 如果是 b23.tv 短链，服务端解析
    else if (urlParam.includes("b23.tv")) {
      finalBvid = await resolveB23ShortLink(urlParam);
    }
  }

  if (!finalBvid) {
    return json({ error: "无法获取BV号，请确认链接正确" }, 400);
  }

  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(finalBvid)}`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
      },
      redirect: "follow",
    });

    const data = await resp.json();
    return json(data);
  } catch (e) {
    return json({ error: `请求失败: ${e.message}` }, 502);
  }
}

// 解析 b23.tv 短链接 → 返回 BV号
async function resolveB23ShortLink(shortUrl) {
  try {
    const resp = await fetch(shortUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });

    // 从最终URL提取BV
    const finalUrl = resp.url;
    let m = finalUrl.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) return m[1];

    // 从HTML内容提取
    const html = await resp.text();
    m = html.match(/bilibili\.com\/video\/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) return m[1];

    return null;
  } catch {
    return null;
  }
}

// OPTIONS (CORS preflight)
export function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}
