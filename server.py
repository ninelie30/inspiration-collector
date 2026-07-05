#!/usr/bin/env python3
"""
灵感收藏家 - 本地服务器（含代理API）
功能：
1. 提供静态文件服务
2. /api/proxy?url=xxx   — 通用网页代理（解决CORS）
3. /api/bilibili?bvid=xxx  — B站视频信息API
4. /api/douyin?url=xxx  — 抖音视频信息API
"""

import http.server
import socketserver
import json
import urllib.request
import urllib.parse
import urllib.error
import os
import sys
import re
import ssl
import base64

PORT = int(os.environ.get("PORT", 8080))
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# 常见 User-Agent
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
UA_MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"


class ThreadingHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    daemon_threads = True
    allow_reuse_address = True


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, status=200, content_type="text/html; charset=utf-8"):
        body = text.encode("utf-8") if isinstance(text, str) else text
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        """Handle POST requests (sync API + WebDAV proxy)"""
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/sync/create":
            self._handle_sync_create()
            return

        if parsed.path == "/api/sync":
            self._handle_sync_push()
            return

        # === 坚果云 WebDAV 代理 ===
        if parsed.path == "/api/webdav/test":
            self._handle_webdav_test()
            return

        if parsed.path == "/api/webdav/pull":
            self._handle_webdav_pull()
            return

        if parsed.path == "/api/webdav/push":
            self._handle_webdav_push()
            return

        self._send_json({"error": "Not found"}, 404)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        # === API: B站视频信息 ===
        if parsed.path == "/api/bilibili":
            self._handle_bilibili(parsed)
            return

        # === API: 抖音视频信息 ===
        if parsed.path == "/api/douyin":
            self._handle_douyin(parsed)
            return

        # === API: 图片代理（解决防盗链 + HTTP混合内容） ===
        if parsed.path == "/api/image":
            self._handle_image(parsed)
            return

        # === API: 通用代理 ===
        if parsed.path == "/api/proxy":
            self._handle_proxy(parsed)
            return

        # === API: 云同步 (拉取) ===
        if parsed.path == "/api/sync":
            self._handle_sync_pull(parsed)
            return

        # === 静态文件 ===
        super().do_GET()

    # === 云同步：本地JSON文件存储 ===
    SYNC_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync_data.json")

    def _load_sync_data(self):
        """读取本地同步数据"""
        try:
            with open(self.SYNC_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def _save_sync_data(self, data):
        """保存同步数据"""
        with open(self.SYNC_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

    @staticmethod
    def _gen_sync_code():
        import random, string
        chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
        return "".join(random.choice(chars) for _ in range(6))

    def _handle_sync_create(self):
        """创建新同步码"""
        code = self._gen_sync_code()
        data = self._load_sync_data()
        import time
        data[code] = {
            "inspirations": [],
            "reflections": [],
            "streak": {"count": 0, "lastDate": None},
            "deletedIds": [],
            "lastModified": int(time.time() * 1000),
        }
        self._save_sync_data(data)
        result = {"code": code, **data[code]}
        self._send_json(result)

    def _handle_sync_pull(self, parsed):
        """拉取同步数据"""
        qs = urllib.parse.parse_qs(parsed.query)
        code = qs.get("code", [None])[0]
        if not code:
            self._send_json({"error": "缺少同步码"}, 400)
            return

        data = self._load_sync_data()
        if code not in data:
            self._send_json({"error": "同步码不存在"}, 404)
            return

        result = {"code": code, **data[code]}
        self._send_json(result)

    def _handle_sync_push(self):
        """推送同步数据（合并后保存）"""
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self._send_json({"error": "无效的JSON"}, 400)
            return

        code = payload.get("code")
        if not code:
            self._send_json({"error": "缺少同步码"}, 400)
            return

        import time
        data = self._load_sync_data()
        existing = data.get(code, {
            "inspirations": [],
            "reflections": [],
            "streak": {"count": 0, "lastDate": None},
            "deletedIds": [],
        })

        # 合并灵感（按ID去重，最新优先）
        insp_map = {}
        for item in existing.get("inspirations", []):
            insp_map[item["id"]] = item
        for item in payload.get("inspirations", []):
            ex = insp_map.get(item["id"])
            if not ex or (item.get("_modifiedAt") or item.get("createdAt", 0)) >= (ex.get("_modifiedAt") or ex.get("createdAt", 0)):
                insp_map[item["id"]] = item

        # 合并反思（按date去重）
        refl_map = {}
        for r in existing.get("reflections", []):
            refl_map[r["date"]] = r
        for r in payload.get("reflections", []):
            ex = refl_map.get(r["date"])
            if not ex or r.get("createdAt", 0) >= ex.get("createdAt", 0):
                refl_map[r["date"]] = r

        # 合并连续天数
        ex_streak = existing.get("streak", {})
        new_streak = payload.get("streak", {})
        merged_streak = {
            "count": max(ex_streak.get("count", 0), new_streak.get("count", 0)),
            "lastDate": new_streak.get("lastDate") or ex_streak.get("lastDate"),
        }

        # 合并删除ID
        merged_deleted = list(set(existing.get("deletedIds", []) + payload.get("deletedIds", [])))
        deleted_set = set(merged_deleted)
        merged_inspirations = [i for i in insp_map.values() if i["id"] not in deleted_set]

        result = {
            "inspirations": merged_inspirations,
            "reflections": list(refl_map.values()),
            "streak": merged_streak,
            "deletedIds": merged_deleted,
            "lastModified": int(time.time() * 1000),
        }
        data[code] = result
        self._save_sync_data(data)

        self._send_json({"success": True, "lastModified": result["lastModified"], "count": len(merged_inspirations)})

    # ========== 坚果云 WebDAV 代理 ==========

    WEBDAV_DEFAULT_BASE = "https://dav.jianguoyun.com/dav"
    WEBDAV_FILE = "/inspiration-collector/data.json"
    WEBDAV_DIR = "/inspiration-collector"

    def _get_webdav_base(self, body):
        """获取 WebDAV 服务器地址，支持自定义"""
        return body.get("server", "").rstrip("/") or self.WEBDAV_DEFAULT_BASE

    def _read_post_body(self):
        """读取 POST 请求的 JSON body"""
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except Exception:
            return {}

    def _webdav_auth_header(self, username, password):
        """构造 Basic Auth header"""
        credentials = f"{username}:{password}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return f"Basic {encoded}"

    def _webdav_request(self, base, method, path, auth, body=None, content_type=None, extra_headers=None):
        """发送 WebDAV 请求到坚果云"""
        url = base + path
        headers = {"Authorization": auth}
        if content_type:
            headers["Content-Type"] = content_type
        if extra_headers:
            headers.update(extra_headers)

        data = body.encode("utf-8") if isinstance(body, str) else body
        req = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read() if e.fp else b""
        except Exception as e:
            return 0, str(e).encode()

    def _handle_webdav_test(self):
        """测试坚果云 WebDAV 连接"""
        body = self._read_post_body()
        username = body.get("username", "")
        password = body.get("password", "")

        if not username or not password:
            self._send_json({"ok": False, "error": "缺少账号或密码"}, 400)
            return

        base = self._get_webdav_base(body)
        auth = self._webdav_auth_header(username, password)
        # GET 数据文件测试认证（标准HTTP，避免 WebDAV 方法兼容问题）
        status, _ = self._webdav_request(base, "GET", self.WEBDAV_FILE, auth)

        # 200=文件存在, 404=首次使用, 非401/403=认证通过
        if status == 401:
            self._send_json({"ok": False, "error": "账号或密码错误"}, 401)
        elif status in (200, 404):
            self._send_json({"ok": True})
        else:
            self._send_json({"ok": False, "error": f"服务器返回 HTTP {status}，请检查地址是否正确"}, 400)

    def _handle_webdav_pull(self):
        """从坚果云拉取数据"""
        body = self._read_post_body()
        username = body.get("username", "")
        password = body.get("password", "")

        if not username or not password:
            self._send_json({"ok": False, "error": "缺少账号或密码"}, 400)
            return

        base = self._get_webdav_base(body)
        auth = self._webdav_auth_header(username, password)
        status, resp_body = self._webdav_request(base, "GET", self.WEBDAV_FILE, auth)

        if status == 404:
            # 文件不存在（首次使用）
            self._send_json({"ok": True, "data": None})
            return

        if status == 401:
            self._send_json({"ok": False, "error": "账号或密码错误"}, 401)
            return

        if status != 200:
            self._send_json({"ok": False, "error": f"HTTP {status}"}, 400)
            return

        try:
            data = json.loads(resp_body)
            self._send_json({"ok": True, "data": data})
        except Exception:
            self._send_json({"ok": True, "data": None})

    def _handle_webdav_push(self):
        """推送数据到坚果云"""
        body = self._read_post_body()
        username = body.get("username", "")
        password = body.get("password", "")
        data = body.get("data")

        if not username or not password:
            self._send_json({"ok": False, "error": "缺少账号或密码"}, 400)
            return

        if data is None:
            self._send_json({"ok": False, "error": "缺少数据"}, 400)
            return

        base = self._get_webdav_base(body)
        auth = self._webdav_auth_header(username, password)

        # 确保目录存在（已存在返回405，忽略）
        self._webdav_request(base, "MKCOL", self.WEBDAV_DIR, auth)

        # 上传文件
        json_str = json.dumps(data, ensure_ascii=False)
        status, _ = self._webdav_request(base, "PUT", self.WEBDAV_FILE, auth, body=json_str, content_type="application/json")

        if status == 401:
            self._send_json({"ok": False, "error": "账号或密码错误"}, 401)
            return

        if status in (200, 201, 204):
            self._send_json({"ok": True})
        else:
            self._send_json({"ok": False, "error": f"HTTP {status}"}, 400)

    def _resolve_b23_short_link(self, short_url):
        """解析 b23.tv / bili2233.cn 短链接 → 返回 BV号 或 None
        策略：HTTP重定向 → meta refresh → JS跳转 → HTML全文搜索"""
        try:
            # === 策略1: HTTP 跟随重定向 ===
            req = urllib.request.Request(short_url, headers={
                "User-Agent": UA,
                "Accept": "text/html,application/xhtml+xml,*/*",
            }, method='GET')
            try:
                with urllib.request.urlopen(req, timeout=8) as resp:
                    final_url = resp.geturl()
                    if 'bilibili.com' in final_url:
                        m = re.search(r'(BV[bB0-9a-zA-Z]{8,})', final_url)
                        if m: return m.group(1)
                    html = resp.read().decode("utf-8", errors="replace")[:20000]
            except urllib.error.HTTPError as e:
                # 手动处理重定向（某些时候 urllib 不跟随）
                if 300 <= e.code < 400:
                    loc = e.headers.get("Location", "")
                    m = re.search(r'(BV[bB0-9a-zA-Z]{8,})', loc)
                    if m: return m.group(1)
                html = (e.read() or b"").decode("utf-8", errors="replace")[:20000]

            # === 策略2: meta refresh 跳转 ===
            m = re.search(r"url=([^\"'\s>]*bilibili[^\"'\s>]*)", html, re.IGNORECASE)
            if m:
                bv = re.search(r'(BV[bB0-9a-zA-Z]{8,})', m.group(1))
                if bv: return bv.group(1)

            # === 策略3: JS 跳转 ===
            m = re.search(r'location\.(?:href|replace)\s*=\s*[\"\']([^\"\']*bilibili[^\"\']*)[\"\']', html, re.IGNORECASE)
            if m:
                bv = re.search(r'(BV[bB0-9a-zA-Z]{8,})', m.group(1))
                if bv: return bv.group(1)

            # === 策略4: 全文搜索 bilibili.com/video/BV ===
            m = re.search(r'bilibili\.com/video/(BV[bB0-9a-zA-Z]{8,})', html, re.IGNORECASE)
            if m: return m.group(1)

            # === 策略5: JSON bvid ===
            m = re.search(r'"bvid"\s*:\s*"(BV[bB0-9a-zA-Z]{8,})"', html)
            if m: return m.group(1)

        except Exception:
            pass
        return None

    def _handle_bilibili(self, parsed):
        """B站视频信息API — 支持 bvid 直接传入，也支持 url 参数（b23.tv短链自动解析）"""
        qs = urllib.parse.parse_qs(parsed.query)
        bvid = qs.get("bvid", [None])[0]
        url_param = qs.get("url", [None])[0]

        # 如果传了 url 而不是 bvid，尝试从 URL 提取 BV
        if not bvid and url_param:
            # 先尝试直接从URL提取
            m = re.search(r'(BV[bB0-9a-zA-Z]{8,})', url_param)
            if m:
                bvid = m.group(1)
            # 如果是 b23.tv 或 bili2233.cn 短链，服务端解析
            elif 'b23.tv' in url_param or 'bili2233.cn' in url_param:
                bvid = self._resolve_b23_short_link(url_param)

        if not bvid:
            self._send_json({"error": "无法获取BV号，请确认链接正确"}, 400)
            return

        api_url = f"https://api.bilibili.com/x/web-interface/view?bvid={urllib.parse.quote(bvid)}"

        try:
            req = urllib.request.Request(api_url, headers={
                "User-Agent": UA,
                "Referer": "https://www.bilibili.com/",
            })
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                self._send_json(data)
        except urllib.error.HTTPError as e:
            self._send_json({"error": f"B站API返回 {e.code}", "detail": e.reason}, 502)
        except Exception as e:
            self._send_json({"error": f"请求失败: {str(e)}"}, 502)

    def _extract_douyin_video_id(self, url):
        """从抖音URL中提取视频ID（15-20位数字）"""
        # douyin.com/video/7402544180900597028
        # iesdouyin.com/share/video/7402544180900597028/
        m = re.search(r'(?:douyin\.com|iesdouyin\.com)/(?:video|share/video)/(\d{15,20})', url)
        if m:
            return m.group(1)
        # modal_id 参数形式
        m = re.search(r'[?&]modal_id=(\d{15,20})', url)
        if m:
            return m.group(1)
        return None

    def _http_get(self, url, headers=None, timeout=5):
        """通用 HTTP GET，返回 (status, final_url, body_bytes) 或 None"""
        try:
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, headers=headers or {}, method='GET')
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
                return resp.status, resp.geturl(), resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.geturl(), e.read()
        except Exception:
            return None

    def _resolve_douyin_short_link(self, short_url):
        """解析抖音短链接 v.douyin.com/xxx → 获取真实URL和video_id。
        返回 (real_url, video_id) 或 (None, None)。"""
        # 用 GET 跟随重定向（urllib 默认跟随重定向）
        result = self._http_get(short_url, headers={
            "User-Agent": UA_MOBILE,
            "Accept": "text/html,application/xhtml+xml,*/*",
        })
        if not result:
            return None, None

        status, final_url, _body = result
        if final_url and final_url != short_url:
            vid = self._extract_douyin_video_id(final_url)
            return final_url, vid

        # 如果重定向没拿到，尝试从 body HTML 中提取
        vid = self._extract_douyin_video_id(short_url)
        return short_url, vid

    def _handle_douyin(self, parsed):
        """获取抖音视频信息 — 策略：短链接→重定向→分享页OG→API回退"""
        try:
            self._handle_douyin_impl(parsed)
        except Exception as e:
            self._send_json({"error": f"服务器内部错误: {str(e)[:200]}"}, 500)

    def _handle_douyin_impl(self, parsed):
        qs = urllib.parse.parse_qs(parsed.query)
        url = qs.get("url", [None])[0]

        if not url:
            self._send_json({"error": "缺少 url 参数"}, 400)
            return

        video_id = self._extract_douyin_video_id(url)

        # 短链接解析
        if not video_id and ('v.douyin.com' in url):
            resolved_url, video_id = self._resolve_douyin_short_link(url)
            if resolved_url:
                url = resolved_url

        if not video_id:
            self._send_json({"error": "无法从链接中提取抖音视频ID，请确认链接格式正确"}, 400)
            return

        # 策略1：抓取分享页 / 视频页 HTML 提取 OG 标签（最可靠）
        for page_url, page_label in [
            (f"https://www.iesdouyin.com/share/video/{video_id}/", "分享页"),
            (f"https://www.douyin.com/video/{video_id}", "视频页"),
        ]:
            result = self._http_get(page_url, headers={
                "User-Agent": UA_MOBILE,
                "Referer": "https://www.douyin.com/",
                "Accept": "text/html,application/xhtml+xml,*/*",
            }, timeout=5)
            if not result:
                continue
            _, _, body = result
            html = body.decode("utf-8", errors="replace")

            meta = self._parse_og_from_html(html, video_id, page_label)
            if meta:
                meta["url"] = url
                self._send_json(meta)
                return

        # 策略2：API 降级（超时设短，避免前端 fetch 超时）
        meta = self._fetch_douyin_by_api(video_id)
        if meta:
            meta["url"] = url
            self._send_json(meta)
            return

        self._send_json({"error": "抖音页面数据获取失败，请确认链接可正常访问", "video_id": video_id,
            "fallback": {
                "title": "抖音视频",
                "description": f"视频ID: {video_id}\n⚠️ 抖音限制第三方访问，无法自动获取视频详情。链接已保存，你可手动补充描述。",
                "image": None,
                "platform": "douyin",
                "video_id": video_id,
            }}, 502)

    def _parse_og_from_html(self, html, video_id, source_label):
        """从HTML中提取视频信息 — OG标签优先，title/description兜底"""
        title = ""
        desc = ""
        image = ""

        # og:title
        m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            title = m.group(1).replace("&#x2F;", "/").replace("&amp;", "&").replace("&quot;", '"')

        # og:description
        m = re.search(r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            desc = m.group(1).replace("&#x2F;", "/").replace("&amp;", "&").replace("&quot;", '"')

        # og:image
        m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
        if m:
            image = m.group(1)
        if not image:
            m = re.search(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if m:
                image = m.group(1)

        # Fallback: <title> 标签
        if not title:
            m = re.search(r'<title[^>]*>([^<]+)</title>', html, re.I)
            if m:
                title = m.group(1).strip()
                # 去掉 " - 抖音" 后缀
                title = re.sub(r'\s*[-–—]\s*抖音\s*$', '', title)

        # Fallback: <meta name="description">
        if not desc:
            m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if m:
                desc = m.group(1).strip()

        # 尝试从 __RENDER_DATA__ 提取（仍作为额外来源）
        if not title:
            m = re.search(r'window\.__RENDER_DATA__\s*=\s*(\{[^<]+\});', html)
            if m:
                try:
                    render_data = json.loads(m.group(1))
                    for key_path in ['aweme.detail.desc', 'aweme.detail.share_info.share_title', 'aweme.detail.share_info.share_desc']:
                        val = render_data
                        for k in key_path.split('.'):
                            val = val.get(k, {}) if isinstance(val, dict) else {}
                        if val and isinstance(val, str) and len(val) > 2:
                            title = val
                            break
                except Exception:
                    pass

        if title or desc:
            return {
                "title": title or f"抖音视频 {video_id}",
                "description": desc or "",
                "image": image or None,
                "platform": "douyin",
                "video_id": video_id,
            }
        return None

    def _fetch_douyin_by_api(self, video_id):
        """通过 API 获取视频信息（作为降级方案，超时设短）"""

        def try_api(api_url, headers):
            try:
                ctx = ssl.create_default_context()
                req = urllib.request.Request(api_url, headers=headers)
                with urllib.request.urlopen(req, timeout=4, context=ctx) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception:
                return None

        # API 1: iesdouyin
        data = try_api(
            f"https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids={video_id}",
            {
                "User-Agent": UA_MOBILE,
                "Referer": "https://www.douyin.com/",
                "Accept": "application/json",
            }
        )
        if data and data.get("item_list"):
            return self._parse_douyin_api_response(data, video_id)

        # API 2: douyin aweme/detail
        data = try_api(
            f"https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id={video_id}",
            {
                "User-Agent": UA_MOBILE,
                "Referer": f"https://www.douyin.com/video/{video_id}",
                "Accept": "application/json",
            }
        )
        if data and data.get("aweme_detail"):
            return self._parse_douyin_api_response_alt(data, video_id)

        return None

    def _parse_douyin_api_response(self, data, video_id):
        """解析 iesdouyin API 响应"""
        try:
            item = data["item_list"][0]
            author = item.get("author", {})
            stats = item.get("statistics", {})
            video_info = item.get("video", {})
            music = item.get("music", {})

            stat_parts = []
            if stats.get("digg_count"):
                stat_parts.append(f"点赞{self._fmt_num(stats['digg_count'])}")
            if stats.get("comment_count"):
                stat_parts.append(f"评论{self._fmt_num(stats['comment_count'])}")
            if stats.get("share_count"):
                stat_parts.append(f"分享{self._fmt_num(stats['share_count'])}")

            desc = item.get("desc", "")
            if author.get("nickname"):
                desc = f"创作者: {author['nickname']}" + (f"\n{desc}" if desc else "")
            if stat_parts:
                desc = desc + ("\n" if desc else "") + " · ".join(stat_parts)
            if music.get("title"):
                desc = desc + f"\nBGM: {music['title']}"

            return {
                "title": item.get("desc", "") or f"抖音视频 {video_id}",
                "description": desc.strip(),
                "image": (video_info.get("cover", {}).get("url_list", [None])[0]
                       or video_info.get("origin_cover", {}).get("url_list", [None])[0]
                       or None),
                "platform": "douyin",
                "video_id": video_id,
            }
        except Exception:
            return None

    def _parse_douyin_api_response_alt(self, data, video_id):
        """解析 douyin aweme/detail API 响应"""
        try:
            item = data["aweme_detail"]
            author = item.get("author", {})
            stats = item.get("statistics", {})
            video_info = item.get("video", {})
            music = item.get("music", {})

            stat_parts = []
            if stats.get("digg_count"):
                stat_parts.append(f"点赞{self._fmt_num(stats['digg_count'])}")
            if stats.get("comment_count"):
                stat_parts.append(f"评论{self._fmt_num(stats['comment_count'])}")
            if stats.get("share_count"):
                stat_parts.append(f"分享{self._fmt_num(stats['share_count'])}")

            desc = item.get("desc", "")
            if author.get("nickname"):
                desc = f"创作者: {author['nickname']}" + (f"\n{desc}" if desc else "")
            if stat_parts:
                desc = desc + ("\n" if desc else "") + " · ".join(stat_parts)
            if music.get("title"):
                desc = desc + f"\nBGM: {music['title']}"

            cover = (video_info.get("cover", {}).get("url_list", [None])[0]
                  or video_info.get("origin_cover", {}).get("url_list", [None])[0]
                  or None)

            return {
                "title": item.get("desc", "") or f"抖音视频 {video_id}",
                "description": desc.strip(),
                "image": cover,
                "platform": "douyin",
                "video_id": video_id,
            }
        except Exception:
            return None

    @staticmethod
    def _fmt_num(n):
        """格式化数字"""
        try:
            n = int(n)
            if n >= 100000000:
                return f"{n/100000000:.2f}亿"
            if n >= 10000:
                return f"{n/10000:.1f}万"
            return str(n)
        except (ValueError, TypeError):
            return str(n)

    def _handle_proxy(self, parsed):
        """通用网页代理"""
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get("url", [None])[0]

        if not target_url:
            self._send_json({"error": "缺少 url 参数"}, 400)
            return

        # 安全检查：只允许 http/https
        if not target_url.startswith(("http://", "https://")):
            self._send_json({"error": "仅支持 http/https 协议"}, 400)
            return

        try:
            req = urllib.request.Request(target_url, headers={
                "User-Agent": UA,
                "Accept": "text/html,application/json,*/*",
            })
            with urllib.request.urlopen(req, timeout=12) as resp:
                content_type = resp.headers.get("Content-Type", "text/html")
                body = resp.read()

                # 限制响应大小（5MB）
                MAX_PROXY_SIZE = 5 * 1024 * 1024
                if len(body) > MAX_PROXY_SIZE:
                    self._send_text(f"代理请求失败: 响应过大 ({len(body)} bytes)", 502, "text/plain")
                    return

                # 如果是JSON，直接返回JSON
                if "json" in content_type:
                    try:
                        data = json.loads(body.decode("utf-8"))
                        self._send_json(data)
                    except Exception:
                        self._send_text(body, content_type=content_type)
                else:
                    # HTML 或其他文本
                    self._send_text(body, content_type=content_type)
        except urllib.error.HTTPError as e:
            self._send_text(f"代理请求失败: HTTP {e.code}", 502, "text/plain")
        except Exception as e:
            self._send_text(f"代理请求失败: {str(e)}", 502, "text/plain")

    def _handle_image(self, parsed):
        """图片代理 — 解决防盗链和HTTP混合内容问题"""
        qs = urllib.parse.parse_qs(parsed.query)
        target_url = qs.get("url", [None])[0]

        if not target_url or not target_url.startswith(("http://", "https://")):
            self._send_text("Bad request", 400, "text/plain")
            return

        # 根据图片来源设置正确的 Referer（防盗链关键）
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
            with urllib.request.urlopen(req, timeout=10) as resp:
                content_type = resp.headers.get("Content-Type", "image/jpeg")
                body = resp.read()

                # 限制大小（5MB）
                if len(body) > 5 * 1024 * 1024:
                    body = body[:5 * 1024 * 1024]

                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                # 缓存7天
                self.send_header("Cache-Control", "public, max-age=604800")
                self.end_headers()
                self.wfile.write(body)
        except Exception as e:
            self._send_text(f"Image fetch failed: {e}", 502, "text/plain")

    def end_headers(self):
        # 为所有响应添加CORS头
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()


def main():
    try:
        with ThreadingHTTPServer(("0.0.0.0", PORT), ProxyHandler) as httpd:
            print(f"🚀 灵感收藏家服务器启动: http://localhost:{PORT}")
            print(f"📁 静态文件目录: {DIRECTORY}")
            print(f"📡 代理API:")
            print(f"   - B站: /api/bilibili?bvid=BVxxxxxxx")
            print(f"   - 抖音: /api/douyin?url=https://v.douyin.com/xxxxx/")
            print(f"   - 通用: /api/proxy?url=https://example.com")
            print(f"按 Ctrl+C 停止")
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"端口 {PORT} 已被占用，请先停止旧进程")
            sys.exit(1)
        raise


if __name__ == "__main__":
    main()
