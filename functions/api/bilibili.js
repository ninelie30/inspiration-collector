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
    else if (urlParam.includes("b23.tv") || urlParam.includes("bili2233.cn")) {
      finalBvid = await resolveShortLink(urlParam);
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
        "Origin": "https://www.bilibili.com",
      },
    });

    const data = await resp.json();
    return json(data);
  } catch (e) {
    return json({ error: `请求失败: ${e.message}` }, 502);
  }
}

// 解析 b23.tv / bili2233.cn 短链接 → 返回 BV号
// 策略：HTTP 重定向 → meta refresh → JS 跳转 → HTML 提取
async function resolveShortLink(shortUrl) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // === 策略1: HTTP 重定向（redirect: "follow"） ===
  try {
    const resp = await fetch(shortUrl, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });

    const finalUrl = resp.url;
    // 检查是否真的跳到了 bilibili.com
    if (finalUrl.includes("bilibili.com")) {
      const m = finalUrl.match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }
  } catch (e) {
    // HTTP redirect failed, continue to next strategy
  }

  // === 策略2: 手动处理（不跟随重定向），检查 Location header ===
  try {
    const resp = await fetch(shortUrl, {
      headers: { "User-Agent": ua, "Accept": "text/html,*/*" },
      redirect: "manual",
    });

    // 检查 HTTP 重定向
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("Location") || resp.headers.get("location") || "";
      const m = loc.match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }

    // 解析 HTML 内容
    const html = await resp.text();

    // meta refresh 跳转: <meta http-equiv="refresh" content="0;url=https://www.bilibili.com/video/BV...">
    const metaMatch = html.match(/url=([^"'\s>]*bilibili[^"'\s>]*)/i);
    if (metaMatch) {
      const m = metaMatch[1].match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }

    // JS 跳转: location.href="..." 或 location.replace("...")
    const jsMatch = html.match(/location\.(?:href|replace)\s*=\s*["']([^"']*bilibili[^"']*)["']/i);
    if (jsMatch) {
      const m = jsMatch[1].match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }

    // 直接在全文中搜索 bilibili.com/video/BV
    const directMatch = html.match(/bilibili\.com\/video\/(BV[bB0-9a-zA-Z]{8,})/i);
    if (directMatch) return directMatch[1];

    // 搜索 video/BV 模式（相对路径）
    const relMatch = html.match(/["']\/video\/(BV[bB0-9a-zA-Z]{8,})["']/);
    if (relMatch) return relMatch[1];

    // JSON 中的 aid 或 bvid
    const jsonMatch = html.match(/"bvid"\s*:\s*"(BV[bB0-9a-zA-Z]{8,})"/);
    if (jsonMatch) return jsonMatch[1];
  } catch (e) {
    // HTML parsing failed
  }

  return null;
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
