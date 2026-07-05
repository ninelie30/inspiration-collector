// B站视频信息 API — Cloudflare Pages Function
// 支持 bvid 直接传入，也支持 url 参数（b23.tv短链自动解析）
// resolve=1: 仅解析短链返回 BV，不调 B站 API（避免 Cloudflare IP 被封）
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const bvid = url.searchParams.get("bvid");
  const urlParam = url.searchParams.get("url");
  const resolveOnly = url.searchParams.get("resolve") === "1";

  let finalBvid = bvid;

  // 如果传了 url 而不是 bvid，尝试从 URL 提取 BV
  if (!finalBvid && urlParam) {
    const m = urlParam.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) {
      finalBvid = m[1];
    }
    else if (urlParam.includes("b23.tv") || urlParam.includes("bili2233.cn")) {
      finalBvid = await resolveShortLink(urlParam);
    }
  }

  if (!finalBvid) {
    return json({ error: "无法获取BV号，请确认链接正确" }, 400);
  }

  // 仅解析模式：返回 BV 让前端直连 B站 API
  if (resolveOnly) {
    return json({ bvid: finalBvid, _resolved: true });
  }

  // 调用 B站 API（可能被 Cloudflare IP 限制，前端有直连兜底）
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(finalBvid)}`;

  try {
    const resp = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://www.bilibili.com/",
        "Origin": "https://www.bilibili.com",
      },
    });

    const text = await resp.text();
    // B站 API 被封时返回 HTML 验证页
    if (text.trim().startsWith("<!") || text.trim().startsWith("<")) {
      return json({ bvid: finalBvid, _blocked: true, _hint: "B站API限流，请前端直连" }, 200);
    }

    const data = JSON.parse(text);
    return json(data);
  } catch (e) {
    return json({ bvid: finalBvid, _blocked: true, _error: e.message }, 200);
  }
}

// 解析 b23.tv / bili2233.cn 短链接 → 返回 BV号
async function resolveShortLink(shortUrl) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // 策略1: HTTP 重定向
  try {
    const resp = await fetch(shortUrl, {
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    });
    const m = resp.url.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) return m[1];
  } catch (e) {}

  // 策略2: manual redirect
  try {
    const resp = await fetch(shortUrl, {
      headers: { "User-Agent": ua, "Accept": "text/html,*/*" },
      redirect: "manual",
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("Location") || "";
      const m = loc.match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }
    const html = await resp.text();
    const m = html.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) return m[0];
  } catch (e) {}

  return null;
}

export function onRequestOptions() {
  return new Response(null, { status: 200, headers: corsHeaders() });
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
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}
