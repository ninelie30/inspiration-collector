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
// 多策略解析，适配 Cloudflare Workers 环境
async function resolveShortLink(shortUrl) {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  // 确保 URL 有协议前缀
  let url = shortUrl.trim();
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }

  let html = '';

  // === 策略1: follow 重定向，从最终 URL 提取 BV ===
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": "https://www.bilibili.com/",
      },
      redirect: "follow",
    });
    const finalUrl = resp.url || '';
    const m = finalUrl.match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (m) return m[1];
    // 读取 HTML 供后续策略使用
    html = await resp.text();
    html = html.substring(0, 30000); // 限制大小
  } catch (e) {
    // follow 失败，尝试 manual
  }

  // === 策略2: manual 重定向，从 Location header 提取 ===
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept": "text/html,*/*",
        "Referer": "https://www.bilibili.com/",
      },
      redirect: "manual",
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("Location") || "";
      const m = loc.match(/(BV[bB0-9a-zA-Z]{8,})/);
      if (m) return m[1];
    }
    if (!html) {
      html = await resp.text();
      html = html.substring(0, 30000);
    }
  } catch (e) {}

  if (!html) return null;

  // === 策略3: meta refresh 跳转 ===
  let m = html.match(/url=([^"'\s>]*bilibili[^"'\s>]*)/i);
  if (m) {
    const bv = m[1].match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (bv) return bv[1];
  }

  // === 策略4: JS location 跳转 ===
  m = html.match(/location\.(?:href|replace)\s*=\s*["']([^"']*bilibili[^"']*)["']/i);
  if (m) {
    const bv = m[1].match(/(BV[bB0-9a-zA-Z]{8,})/);
    if (bv) return bv[1];
  }

  // === 策略5: HTML 全文搜索 bilibili.com/video/BV ===
  m = html.match(/bilibili\.com\/video\/(BV[bB0-9a-zA-Z]{8,})/i);
  if (m) return m[1];

  // === 策略6: JSON 中的 bvid 字段 ===
  m = html.match(/"bvid"\s*:\s*"(BV[bB0-9a-zA-Z]{8,})"/i);
  if (m) return m[1];

  // === 策略7: URL 参数中的 bvid ===
  m = html.match(/[?&]bvid=(BV[bB0-9a-zA-Z]{8,})/i);
  if (m) return m[1];

  // === 策略8: 任意位置的 BV号（最后手段，可能误匹配） ===
  m = html.match(/(BV[bB0-9a-zA-Z]{10,})/);
  if (m) return m[1];

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
