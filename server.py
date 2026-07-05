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

        # === 静态文件 ===
        super().do_GET()

    def _handle_bilibili(self, parsed):
        """直接调用B站API获取视频信息"""
        qs = urllib.parse.parse_qs(parsed.query)
        bvid = qs.get("bvid", [None])[0]

        if not bvid:
            self._send_json({"error": "缺少 bvid 参数"}, 400)
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

                # 如果是JSON，直接返回JSON
                if "json" in content_type:
                    try:
                        data = json.loads(body.decode("utf-8"))
                        self._send_json(data)
                    except:
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
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
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
