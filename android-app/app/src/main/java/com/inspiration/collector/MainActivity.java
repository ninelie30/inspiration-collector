package com.inspiration.collector;

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebSettings;

import androidx.annotation.RequiresApi;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 灵感收藏家 - Android APP
 *
 * WebView 加载本地资产中的 HTML，API 调用在原生层做代理，
 * 绕过浏览器的 CORS 限制，让手机国内 IP 直连 B站/坚果云。
 */
public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private static final String DAV_BASE = "https://dav.jianguoyun.com/dav";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 使用 AssetLoader 服务 file:///android_asset/ 下的文件
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        // 注册原生 WebDAV 桥接口（JavaScript 可通过 window.WebDAVBridge 调用）
        webView.addJavascriptInterface(new WebDAVBridgeInterface(), "WebDAVBridge");

        webView.setWebViewClient(new WebViewClient() {
            // Android 5.0+ 的请求拦截
            @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                // 拦截 /api/ 路径的请求，这些请求原本发给 server.py 或 Cloudflare
                if (url.contains("/api/")) {
                    return handleApiRequest(request);
                }
                return null; // 其他请求让 WebView 正常处理
            }

            // 兼容 Android 4.4 及以下
            @Override
            @SuppressWarnings("deprecation")
            public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (url.contains("/api/")) {
                    return handleApiRequest(url, "GET", null, null);
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // 注入标志变量，通知前端运行在 Android 原生环境中
                view.evaluateJavascript(
                    "window.__ANDROID_NATIVE__ = true;", null);
            }
        });

        // 加载本地 HTML（打包在 APK 的 assets 目录中）
        webView.loadUrl("https://appassets.androidplatform.net/index.html");
    }

    // ========== API 请求处理 ==========

    /** API 21+ 版本 */
    @RequiresApi(api = Build.VERSION_CODES.LOLLIPOP)
    private WebResourceResponse handleApiRequest(WebResourceRequest request) {
        String url = request.getUrl().toString();
        String method = request.getMethod();
        Map<String, String> requestHeaders = request.getRequestHeaders();

        // 读取 POST/PUT 请求体（通过 request body 读取）
        // 注意: shouldInterceptRequest 的 request 没有提供 getBody()
        // 所以 WebDAV 的 POST 走 JavaScript Bridge（WebDAVBridgeInterface）
        // 这里只处理 GET 请求
        if (!"GET".equalsIgnoreCase(method)) {
            // POST/PUT 走 WebDAVBridge，这里返回 null 让前端 fallback
            return null;
        }

        return handleApiRequest(url, method, requestHeaders, null);
    }

    /** 通用 API 请求处理（GET） */
    private WebResourceResponse handleApiRequest(String url, String method,
                                                  Map<String, String> headers, byte[] body) {
        try {
            Uri uri = Uri.parse(url);

            // ========== B站 API 代理 ==========
            if (url.contains("/api/bilibili")) {
                String bvid = uri.getQueryParameter("bvid");
                String urlParam = uri.getQueryParameter("url");
                String resolveOnly = uri.getQueryParameter("resolve");

                // resolve=1 时：前端只想要解析短链得到 BV
                if ("1".equals(resolveOnly) && urlParam != null) {
                    // 尝试通过重定向解析 b23.tv 短链
                    String resolvedBv = resolveB23ShortLink(urlParam);
                    if (resolvedBv != null) {
                        return jsonResponse("{\"bvid\":\"" + resolvedBv + "\",\"_resolved\":true}");
                    }
                    return jsonResponse("{\"error\":\"无法解析短链\"}", 400);
                }

                // 直接请求 B站 API
                String apiUrl;
                if (bvid != null) {
                    apiUrl = "https://api.bilibili.com/x/web-interface/view?bvid=" + bvid;
                } else if (urlParam != null) {
                    // 不带 resolve=1，服务端完整解析
                    String resolvedBv = resolveB23ShortLink(urlParam);
                    if (resolvedBv == null) {
                        return jsonResponse("{\"error\":\"无法解析BV号\"}", 400);
                    }
                    apiUrl = "https://api.bilibili.com/x/web-interface/view?bvid=" + resolvedBv;
                } else {
                    return jsonResponse("{\"error\":\"缺少参数\"}", 400);
                }

                return proxyHttpGet(apiUrl, "https://www.bilibili.com");
            }

            // ========== 图片代理 ==========
            if (url.contains("/api/image")) {
                String targetUrl = uri.getQueryParameter("url");
                if (targetUrl == null || targetUrl.isEmpty()) {
                    return jsonResponse("{\"error\":\"缺少url参数\"}", 400);
                }
                return proxyImage(targetUrl);
            }

            // ========== 通用网页代理 ==========
            if (url.contains("/api/proxy")) {
                String targetUrl = uri.getQueryParameter("url");
                if (targetUrl == null || targetUrl.isEmpty()) {
                    return jsonResponse("{\"error\":\"缺少url参数\"}", 400);
                }
                return proxyHttpGet(targetUrl, null);
            }

            // ========== 抖音 API ==========
            if (url.contains("/api/douyin")) {
                String targetUrl = uri.getQueryParameter("url");
                if (targetUrl == null) {
                    return jsonResponse("{\"error\":\"缺少url参数\"}", 400);
                }
                // 抖音 API 在本地不好做，返回降级数据
                return jsonResponse("{\"error\":\"请在浏览器中使用此功能\"}", 502);
            }

            // 未知 API 路径
            return jsonResponse("{\"error\":\"unknown api\"}", 404);

        } catch (Exception e) {
            return jsonResponse("{\"error\":\"" + escapeJson(e.getMessage()) + "\"}", 500);
        }
    }

    // ========== HTTP 代理方法 ==========

    /** GET 代理请求 */
    private WebResourceResponse proxyHttpGet(String targetUrl, String referer) {
        try {
            URL url = new URL(targetUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android 14; Xiaomi15) AppleWebKit/537.36");
            conn.setRequestProperty("Accept", "*/*");
            if (referer != null) {
                conn.setRequestProperty("Referer", referer);
            }
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            int statusCode = conn.getResponseCode();
            String contentType = conn.getContentType();
            if (contentType == null) contentType = "application/octet-stream";
            String encoding = conn.getContentEncoding();
            if (encoding == null) encoding = "UTF-8";
            InputStream stream = (statusCode >= 400)
                ? conn.getErrorStream() : conn.getInputStream();
            if (stream == null) stream = new ByteArrayInputStream(new byte[0]);

            return new WebResourceResponse(contentType, encoding, statusCode, "OK", null, stream);
        } catch (Exception e) {
            return jsonResponse("{\"error\":\"proxy: " + escapeJson(e.getMessage()) + "\"}", 502);
        }
    }

    /** 图片代理 */
    private WebResourceResponse proxyImage(String targetUrl) {
        try {
            URL url = new URL(targetUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android 14; Xiaomi15) AppleWebKit/537.36");
            conn.setRequestProperty("Accept", "image/webp,image/*,*/*");

            // 防盗链 Referer
            if (targetUrl.contains("hdslb.com") || targetUrl.contains("bilivideo")) {
                conn.setRequestProperty("Referer", "https://www.bilibili.com");
            } else if (targetUrl.contains("douyin") || targetUrl.contains("iesdouyin")) {
                conn.setRequestProperty("Referer", "https://www.douyin.com");
            }
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            int statusCode = conn.getResponseCode();
            String contentType = conn.getContentType();
            if (contentType == null) contentType = "image/jpeg";
            InputStream stream = (statusCode >= 400)
                ? conn.getErrorStream() : conn.getInputStream();
            if (stream == null) stream = new ByteArrayInputStream(new byte[0]);

            return new WebResourceResponse(contentType, null, statusCode, "OK", null, stream);
        } catch (Exception e) {
            return jsonResponse("{\"error\":\"image proxy failed\"}", 502);
        }
    }

    // ========== b23.tv 短链解析 ==========

    /** 解析 b23.tv 短链，返回 BV 号 */
    private String resolveB23ShortLink(String shortUrl) {
        // 确保 URL 有协议前缀
        if (!shortUrl.startsWith("http")) {
            shortUrl = "https://" + shortUrl;
        }
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(shortUrl).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            // 不自动跟随重定向，手动处理获取最终 URL
            conn.setInstanceFollowRedirects(false);
            conn.connect();

            int status = conn.getResponseCode();
            // 跟随重定向链
            String finalUrl = shortUrl;
            while (status >= 300 && status < 400) {
                String location = conn.getHeaderField("Location");
                if (location == null) break;
                finalUrl = location;
                if (!location.startsWith("http")) {
                    Uri base = Uri.parse(finalUrl);
                    finalUrl = base.getScheme() + "://" + base.getHost() + location;
                }
                conn = (HttpURLConnection) new URL(finalUrl).openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
                conn.connect();
                status = conn.getResponseCode();
            }

            // 从最终 URL 提取 BV
            java.util.regex.Matcher m = java.util.regex.Pattern
                .compile("BV[bB0-9a-zA-Z]{8,}").matcher(finalUrl);
            if (m.find()) return m.group();

            // 从响应 HTML 提取
            if (conn.getResponseCode() == 200) {
                BufferedReader reader = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder html = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null && html.length() < 50000) {
                    html.append(line);
                }
                reader.close();
                String htmlStr = html.toString();
                m = java.util.regex.Pattern
                    .compile("bilibili\\.com/video/(BV[bB0-9a-zA-Z]{8,})")
                    .matcher(htmlStr);
                if (m.find()) return m.group(1);
                m = java.util.regex.Pattern
                    .compile("\"bvid\"\\s*:\\s*\"(BV[bB0-9a-zA-Z]{8,})\"")
                    .matcher(htmlStr);
                if (m.find()) return m.group(1);
                m = java.util.regex.Pattern
                    .compile("(BV[bB0-9a-zA-Z]{10,})").matcher(htmlStr);
                if (m.find()) return m.group(1);
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    // ========== WebDAV 桥（JavaScript Bridge） ==========

    /**
     * JavaScript 桥接口，供前端 sync.js 调用。
     * frontend 通过 window.WebDAVBridge 访问此接口。
     */
    private class WebDAVBridgeInterface {

        @android.webkit.JavascriptInterface
        public String webdavRequest(String endpoint, String jsonBody) {
            try {
                // 解析 JSON body
                org.json.JSONObject body = new org.json.JSONObject(jsonBody);
                String username = body.optString("username", "");
                String password = body.optString("password", "");
                String server = body.optString("server", "");
                String dataStr = body.optString("data", "");

                String base = server.isEmpty() ? DAV_BASE : server.replaceAll("/+$", "");
                String auth = "Basic " + Base64.encodeToString(
                    (username + ":" + password).getBytes(StandardCharsets.UTF_8),
                    Base64.NO_WRAP);

                String filePath = "/inspiration-collector/data.json";
                String dirPath = "/inspiration-collector";

                switch (endpoint) {
                    case "test": {
                        // GET 请求数据文件测试连通性
                        int code = httpRequest(base + filePath, "GET", auth, null);
                        if (code == 401 || code == 403) {
                            return "{\"ok\":false,\"error\":\"账号或密码错误\"}";
                        }
                        if (code == 200 || code == 404 || code == 405) {
                            return "{\"ok\":true}";
                        }
                        return "{\"ok\":false,\"error\":\"HTTP " + code + "\"}";
                    }
                    case "pull": {
                        return webdavPull(base, auth, filePath);
                    }
                    case "push": {
                        return webdavPush(base, auth, dirPath, filePath, dataStr);
                    }
                    default:
                        return "{\"ok\":false,\"error\":\"unknown action\"}";
                }
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
            }
        }
    }

    // ========== WebDAV 操作 ==========

    private String webdavPull(String base, String auth, String filePath) {
        try {
            URL url = new URL(base + filePath);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", auth);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            int code = conn.getResponseCode();
            if (code == 404 || code == 405) {
                return "{\"ok\":true,\"data\":null}";
            }
            if (code == 401) {
                return "{\"ok\":false,\"error\":\"账号或密码错误\"}";
            }
            if (code != 200) {
                return "{\"ok\":false,\"error\":\"HTTP " + code + "\"}";
            }

            BufferedReader reader = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();

            return "{\"ok\":true,\"data\":" + sb + "}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
        }
    }

    private String webdavPush(String base, String auth, String dirPath,
                               String filePath, String dataStr) {
        try {
            // 先创建目录（已存在会返回 405，忽略）
            try {
                URL dirUrl = new URL(base + dirPath);
                HttpURLConnection dirConn = (HttpURLConnection) dirUrl.openConnection();
                dirConn.setRequestMethod("MKCOL");
                dirConn.setRequestProperty("Authorization", auth);
                dirConn.setConnectTimeout(10000);
                dirConn.connect();
                dirConn.getResponseCode(); // 忽略结果
            } catch (Exception ignored) {}

            // PUT 上传数据
            URL url = new URL(base + filePath);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PUT");
            conn.setRequestProperty("Authorization", auth);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.connect();

            OutputStream os = conn.getOutputStream();
            os.write(dataStr.getBytes(StandardCharsets.UTF_8));
            os.flush();
            os.close();

            int code = conn.getResponseCode();
            if (code == 401) {
                return "{\"ok\":false,\"error\":\"账号或密码错误\"}";
            }
            if (code == 200 || code == 201 || code == 204) {
                return "{\"ok\":true}";
            }
            return "{\"ok\":false,\"error\":\"上传失败 HTTP " + code + "\"}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}";
        }
    }

    // ========== 工具方法 ==========

    private int httpRequest(String urlStr, String method, String auth, String body) {
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(method);
            if (auth != null) conn.setRequestProperty("Authorization", auth);
            if (body != null && (method.equals("PUT") || method.equals("POST") || method.equals("MKCOL"))) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/xml; charset=utf-8");
            }
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);
            if (body != null) {
                OutputStream os = conn.getOutputStream();
                os.write(body.getBytes(StandardCharsets.UTF_8));
                os.close();
            }
            conn.connect();
            return conn.getResponseCode();
        } catch (Exception e) {
            return 0;
        }
    }

    private WebResourceResponse jsonResponse(String json) {
        return jsonResponse(json, 200);
    }

    private WebResourceResponse jsonResponse(String json, int status) {
        ByteArrayInputStream stream = new ByteArrayInputStream(
            json.getBytes(StandardCharsets.UTF_8));
        return new WebResourceResponse("application/json", "UTF-8",
            status, "OK", null, stream);
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    // ========== 物理返回键 ==========
    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
