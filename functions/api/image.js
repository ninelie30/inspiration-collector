// 图片代理 API — 解决防盗链 — Cloudflare Pages Function
export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl || !targetUrl.startsWith("http")) {
    return new Response("Bad request", { status: 400 });
  }

  // 根据域名决定 Referer（防盗链）
  let referer = "";
  if (targetUrl.includes("hdslb.com") || targetUrl.includes("bilivideo") || targetUrl.includes("biliimg")) {
    referer = "https://www.bilibili.com";
  } else if (targetUrl.includes("douyin") || targetUrl.includes("iesdouyin") || targetUrl.includes("amemv")) {
    referer = "https://www.douyin.com";
  } else if (targetUrl.includes("xiaohongshu") || targetUrl.includes("xhscdn")) {
    referer = "https://www.xiaohongshu.com";
  } else if (targetUrl.includes("weibo") || targetUrl.includes("sinaimg")) {
    referer = "https://weibo.com";
  }

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
  };
  if (referer) {
    headers["Referer"] = referer;
  }

  try {
    const resp = await fetch(targetUrl, { headers });

    if (!resp.ok) {
      return new Response(`Image fetch failed: ${resp.status}`, {
        status: 502,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    const contentType = resp.headers.get("Content-Type") || "image/jpeg";
    const body = await resp.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return new Response(`Image fetch failed: ${e.message}`, {
      status: 502,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
