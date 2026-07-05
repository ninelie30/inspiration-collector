"""B站视频信息 API — Vercel Serverless Function"""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote
import json
import urllib.request
import urllib.error

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        qs = parse_qs(parsed.query)
        bvid = qs.get("bvid", [None])[0]

        if not bvid:
            self._send_json({"error": "缺少 bvid 参数"}, 400)
            return

        api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={quote(bvid)}"

        try:
            req = urllib.request.Request(api_url, headers={
                "User-Agent": UA,
                "Referer": "https://www.bilibili.com/",
            })
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._send_json(data)
        except urllib.error.HTTPError as e:
            self._send_json({"error": f"B站API返回 {e.code}", "detail": e.reason}, 502)
        except Exception as e:
            self._send_json({"error": f"请求失败: {str(e)}"}, 502)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)
