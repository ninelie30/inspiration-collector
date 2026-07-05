// 抖音视频信息 API — Cloudflare Pages Function
// 策略：短链接重定向 → 分享页OG标签 → API降级
const UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    return json({ error: "缺少 url 参数" }, 400);
  }

  try {
    let videoId = extractVideoId(targetUrl);
    let currentUrl = targetUrl;

    // 短链接解析
    if (!videoId && targetUrl.includes("v.douyin.com")) {
      const resolved = await resolveShortLink(targetUrl);
      if (resolved.url) currentUrl = resolved.url;
      if (resolved.videoId) videoId = resolved.videoId;
    }

    if (!videoId) {
      return json({ error: "无法从链接中提取抖音视频ID，请确认链接格式正确" }, 400);
    }

    // 尝试分享页和视频页
    for (const [pageUrl, label] of [
      [`https://www.iesdouyin.com/share/video/${videoId}/`, "分享页"],
      [`https://www.douyin.com/video/${videoId}`, "视频页"],
    ]) {
      const meta = await fetchAndParseOG(pageUrl, videoId);
      if (meta) {
        meta.url = currentUrl;
        return json(meta);
      }
    }

    // API 降级
    const apiMeta = await fetchByApi(videoId);
    if (apiMeta) {
      apiMeta.url = currentUrl;
      return json(apiMeta);
    }

    return json({
      error: "抖音页面数据获取失败",
      video_id: videoId,
      fallback: {
        title: "抖音视频",
        description: `视频ID: ${videoId}`,
        image: null,
        platform: "douyin",
        video_id: videoId,
      },
    }, 502);
  } catch (e) {
    return json({ error: `服务器内部错误: ${e.message}` }, 500);
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function extractVideoId(url) {
  let m = url.match(/(?:douyin\.com|iesdouyin\.com)\/(?:video|share\/video)\/(\d{15,20})/);
  if (m) return m[1];
  m = url.match(/[?&]modal_id=(\d{15,20})/);
  if (m) return m[1];
  return null;
}

async function resolveShortLink(shortUrl) {
  try {
    const resp = await fetch(shortUrl, {
      headers: {
        "User-Agent": UA_MOBILE,
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
      redirect: "follow",
    });
    const finalUrl = resp.url;
    if (finalUrl && finalUrl !== shortUrl) {
      return { url: finalUrl, videoId: extractVideoId(finalUrl) };
    }
    return { url: shortUrl, videoId: extractVideoId(shortUrl) };
  } catch {
    return { url: null, videoId: null };
  }
}

async function fetchAndParseOG(pageUrl, videoId) {
  try {
    const resp = await fetch(pageUrl, {
      headers: {
        "User-Agent": UA_MOBILE,
        "Referer": "https://www.douyin.com/",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
    });
    const html = await resp.text();
    return parseOG(html, videoId);
  } catch {
    return null;
  }
}

function parseOG(html, videoId) {
  let title = "";
  let desc = "";
  let image = "";

  let m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (m) title = m[1].replace(/&#x2F;/g, "/").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) desc = m[1].replace(/&#x2F;/g, "/").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

  m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (m) image = m[1];

  if (!image) {
    m = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    if (m) image = m[1];
  }

  if (!title) {
    m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) {
      title = m[1].trim().replace(/\s*[-\u2013\u2014]\s*\u62b1\u97f3\s*$/, "");
    }
  }

  if (!desc) {
    m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (m) desc = m[1].trim();
  }

  // __RENDER_DATA__ JSON
  if (!title) {
    m = html.match(/window\.__RENDER_DATA__\s*=\s*(\{[^<]+\});/);
    if (m) {
      try {
        const rd = JSON.parse(m[1]);
        for (const kp of ["aweme.detail.desc", "aweme.detail.share_info.share_title", "aweme.detail.share_info.share_desc"]) {
          let val = rd;
          for (const k of kp.split(".")) {
            val = (val && typeof val === "object") ? val[k] : undefined;
          }
          if (val && typeof val === "string" && val.length > 2) {
            title = val;
            break;
          }
        }
      } catch {}
    }
  }

  if (title || desc) {
    return {
      title: title || `抖音视频 ${videoId}`,
      description: desc || "",
      image: image || null,
      platform: "douyin",
      video_id: videoId,
    };
  }
  return null;
}

async function fetchByApi(videoId) {
  // API 1
  try {
    const resp = await fetch(
      `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`,
      { headers: { "User-Agent": UA_MOBILE, "Referer": "https://www.douyin.com/", "Accept": "application/json" } }
    );
    const data = await resp.json();
    if (data.item_list && data.item_list.length > 0) {
      return buildMeta(data.item_list[0], videoId);
    }
  } catch {}

  // API 2
  try {
    const resp = await fetch(
      `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${videoId}`,
      { headers: { "User-Agent": UA_MOBILE, "Referer": `https://www.douyin.com/video/${videoId}`, "Accept": "application/json" } }
    );
    const data = await resp.json();
    if (data.aweme_detail) {
      return buildMeta(data.aweme_detail, videoId);
    }
  } catch {}

  return null;
}

function buildMeta(item, videoId) {
  const author = item.author || {};
  const stats = item.statistics || {};
  const vi = item.video || {};
  const music = item.music || {};

  const parts = [];
  if (stats.digg_count) parts.push(`点赞${fmt(stats.digg_count)}`);
  if (stats.comment_count) parts.push(`评论${fmt(stats.comment_count)}`);
  if (stats.share_count) parts.push(`分享${fmt(stats.share_count)}`);

  let desc = item.desc || "";
  if (author.nickname) {
    desc = `创作者: ${author.nickname}` + (desc ? `\n${desc}` : "");
  }
  if (parts.length > 0) {
    desc = desc + (desc ? "\n" : "") + parts.join(" · ");
  }
  if (music.title) {
    desc = desc + `\nBGM: ${music.title}`;
  }

  const cover = (vi.cover?.url_list?.[0]) || (vi.origin_cover?.url_list?.[0]) || null;

  return {
    title: item.desc || `抖音视频 ${videoId}`,
    description: desc.trim(),
    image: cover,
    platform: "douyin",
    video_id: videoId,
  };
}

function fmt(n) {
  try {
    n = parseInt(n);
    if (n >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (n >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    return String(n);
  } catch {
    return String(n);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
