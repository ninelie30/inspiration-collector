"""抖音视频信息 API — Vercel Serverless Function
策略：短链接重定向 → 分享页OG标签 → API降级"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import json
import urllib.request
import urllib.error
import re
import ssl

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        try:
            self._handle()
        except Exception as e:
            self._send_json({"error": f"服务器内部错误: {str(e)[:200]}"}, 500)

    def _handle(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        url = qs.get("url", [None])[0]

        if not url:
            self._send_json({"error": "缺少 url 参数"}, 400)
            return

        video_id = self._extract_video_id(url)

        if not video_id and 'v.douyin.com' in url:
            resolved_url, video_id = self._resolve_short_link(url)
            if resolved_url:
                url = resolved_url

        if not video_id:
            self._send_json({"error": "无法从链接中提取抖音视频ID，请确认链接格式正确"}, 400)
            return

        for page_url, label in [
            (f"https://www.iesdouyin.com/share/video/{video_id}/", "分享页"),
            (f"https://www.douyin.com/video/{video_id}", "视频页"),
        ]:
            result = self._http_get(page_url, {
                "User-Agent": UA_MOBILE,
                "Referer": "https://www.douyin.com/",
                "Accept": "text/html,application/xhtml+xml,*/*",
            }, timeout=3)
            if not result:
                continue
            _, _, body = result
            html = body.decode("utf-8", errors="replace")
            meta = self._parse_og(html, video_id)
            if meta:
                meta["url"] = url
                self._send_json(meta)
                return

        meta = self._fetch_by_api(video_id)
        if meta:
            meta["url"] = url
            self._send_json(meta)
            return

        self._send_json({
            "error": "抖音页面数据获取失败",
            "video_id": video_id,
            "fallback": {
                "title": "抖音视频",
                "description": f"视频ID: {video_id}",
                "image": None,
                "platform": "douyin",
                "video_id": video_id,
            }
        }, 502)

    def _extract_video_id(self, url):
        m = re.search(r'(?:douyin\.com|iesdouyin\.com)/(?:video|share/video)/(\d{15,20})', url)
        if m:
            return m.group(1)
        m = re.search(r'[?&]modal_id=(\d{15,20})', url)
        if m:
            return m.group(1)
        return None

    def _http_get(self, url, headers, timeout=3):
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, headers=headers or {}, method='GET')
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.status, resp.geturl(), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.geturl(), e.read()
        except Exception:
            return None

    def _resolve_short_link(self, short_url):
        result = self._http_get(short_url, {
            "User-Agent": UA_MOBILE,
            "Accept": "text/html,application/xhtml+xml,*/*",
        }, timeout=3)
        if not result:
            return None, None
        _, final_url, _ = result
        if final_url and final_url != short_url:
            vid = self._extract_video_id(final_url)
            return final_url, vid
        vid = self._extract_video_id(short_url)
        return short_url, vid

    def _parse_og(self, html, video_id):
        title = ""
        desc = ""
        image = ""

        m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            title = m.group(1).replace("&#x2F;", "/").replace("&amp;", "&").replace("&quot;", '"')

        m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            desc = m.group(1).replace("&#x2F;", "/").replace("&amp;", "&").replace("&quot;", '"')

        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            image = m.group(1)
        if not image:
            m = re.search(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if m:
                image = m.group(1)

        if not title:
            m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
            if m:
                title = m.group(1).strip()
                title = re.sub(r'\s*[-\u2013\u2014]\s*\u62b1\u97f3\s*$', '', title)

        if not desc:
            m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if m:
                desc = m.group(1).strip()

        if not title:
            m = re.search(r'window\.__RENDER_DATA__\s*=\s*(\{[^<]+\});', html)
            if m:
                try:
                    rd = json.loads(m.group(1))
                    for kp in ['aweme.detail.desc', 'aweme.detail.share_info.share_title', 'aweme.detail.share_info.share_desc']:
                        val = rd
                        for k in kp.split('.'):
                            val = val.get(k, {}) if isinstance(val, dict) else {}
                        if val and isinstance(val, str) and len(val) > 2:
                            title = val
                            break
                except Exception:
                    pass

        if title or desc:
            return {
                "title": title or f"\u62b1\u97f3\u89c6\u9891 {video_id}",
                "description": desc or "",
                "image": image or None,
                "platform": "douyin",
                "video_id": video_id,
            }
        return None

    def _fetch_by_api(self, video_id):
        def try_api(api_url, headers):
            try:
                ctx = ssl.create_default_context()
                req = urllib.request.Request(api_url, headers=headers)
                with urllib.request.urlopen(req, timeout=3, context=ctx) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception:
                return None

        data = try_api(
            f"https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={video_id}",
            {"User-Agent": UA_MOBILE, "Referer": "https://www.douyin.com/", "Accept": "application/json"}
        )
        if data and data.get("item_list"):
            return self._parse_api_v1(data, video_id)

        data = try_api(
            f"https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={video_id}",
            {"User-Agent": UA_MOBILE, "Referer": f"https://www.douyin.com/video/{video_id}", "Accept": "application/json"}
        )
        if data and data.get("aweme_detail"):
            return self._parse_api_v2(data, video_id)

        return None

    def _parse_api_v1(self, data, video_id):
        try:
            item = data["item_list"][0]
            return self._build_meta(item, video_id)
        except Exception:
            return None

    def _parse_api_v2(self, data, video_id):
        try:
            item = data["aweme_detail"]
            return self._build_meta(item, video_id)
        except Exception:
            return None

    def _build_meta(self, item, video_id):
        author = item.get("author", {})
        stats = item.get("statistics", {})
        vi = item.get("video", {})
        music = item.get("music", {})

        parts = []
        if stats.get("digg_count"):
            parts.append(f"\u70b9\u8d5e{self._fmt(stats['digg_count'])}")
        if stats.get("comment_count"):
            parts.append(f"\u8bc4\u8bba{self._fmt(stats['comment_count'])}")
        if stats.get("share_count"):
            parts.append(f"\u5206\u4eab{self._fmt(stats['share_count'])}")

        desc = item.get("desc", "")
        if author.get("nickname"):
            desc = f"\u521b\u4f5c\u8005: {author['nickname']}" + (f"\n{desc}" if desc else "")
        if parts:
            desc = desc + ("\n" if desc else "") + " \u00b7 ".join(parts)
        if music.get("title"):
            desc = desc + f"\nBGM: {music['title']}"

        cover = (vi.get("cover", {}).get("url_list", [None])[0]
              or vi.get("origin_cover", {}).get("url_list", [None])[0]
              or None)

        return {
            "title": item.get("desc", "") or f"\u62b1\u97f3\u89c6\u9891 {video_id}",
            "description": desc.strip(),
            "image": cover,
            "platform": "douyin",
            "video_id": video_id,
        }

    @staticmethod
    def _fmt(n):
        try:
            n = int(n)
            if n >= 100000000:
                return f"{n/100000000:.2f}\u4ebf"
            if n >= 10000:
                return f"{n/10000:.1f}\u4e07"
            return str(n)
        except (ValueError, TypeError):
            return str(n)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
