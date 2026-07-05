"""图片代理 API — 解决防盗链 + HTTP混合内容"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import urllib.request
import ssl


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        target_url = qs.get("url", [None])[0]

        if not target_url or not target_url.startswith(("http://", "https://")):
            self._send_text("Bad request", 400)
            return

        UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

        referer = ""
        if "hdslb.com" in target_url or "bilivideo" in target_url or "biliimg" in target_url:
            referer = "https://www.bilibili.com"
        elif "douyin" in target_url or "iesdouyin" in target_url or "amemv" in target_url:
            referer = "https://www.douyin.com"
        elif "xiaohongshu" in target_url or "xhscdn" in target_url:
            referer = "https://www.xiaohongshu.com"
        elif "weibo" in target_url or "sinaimg" in target_url:
            referer = "https://weibo.com"

        headers = {
            "User-Agent": UA,
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer

        try:
            req = urllib.request.Request(target_url, headers=headers)
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
                content_type = resp.headers.get("Content-Type", "image/jpeg")
                body = resp.read()

                if len(body) > 4 * 1024 * 1024:
                    body = body[:4 * 1024 * 1024]

                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "public, max-age=604800")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self._send_text(f"Image fetch failed: {e}", 502)

    def _send_text(self, text, status=200):
        body = text.encode("utf-8") if isinstance(text, str) else text
        self.send_response(status)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
