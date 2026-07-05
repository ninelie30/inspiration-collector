#!/usr/bin/env python3
"""
灵感收藏家 - 本地桌面版启动器
一键启动本地服务器 + 自动打开浏览器
无需任何第三方依赖，仅需 Python 3
"""

import os
import sys
import webbrowser
import socket
import threading
import time
import signal

# 确保脚本目录在 PATH 中
APP_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(APP_DIR)
sys.path.insert(0, APP_DIR)

PORT = int(os.environ.get("PORT", 8080))
SERVER_SCRIPT = os.path.join(APP_DIR, "server.py")


def find_free_port(start=8080):
    """找到一个可用端口"""
    for port in range(start, start + 100):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return start  # 兜底


def open_browser(port, delay=1.5):
    """延迟打开浏览器"""

    def _open():
        time.sleep(delay)
        url = f"http://localhost:{port}"
        print(f"\n   🌐 正在打开浏览器: {url}")
        webbrowser.open(url)

    threading.Thread(target=_open, daemon=True).start()


def print_banner(port):
    """打印启动信息"""
    banner = f"""
╔══════════════════════════════════════════╗
║         ✨ 灵感收藏家 ✨                 ║
║                                          ║
║  本地服务器已启动                        ║
║  地址: http://localhost:{port}              ║
║  按 Ctrl+C 停止服务器                    ║
╚══════════════════════════════════════════╝
"""
    print(banner)


def main():
    port = find_free_port(PORT)

    # 设置环境变量让 server.py 读取
    os.environ["PORT"] = str(port)

    # 检查 server.py 是否存在
    if not os.path.exists(SERVER_SCRIPT):
        print(f"错误: 找不到 {SERVER_SCRIPT}")
        sys.exit(1)

    print_banner(port)
    open_browser(port)

    # 直接导入并运行 server.py 的 main 函数
    # 这样不需要子进程，Ctrl+C 响应更干净
    server_dir = os.path.dirname(os.path.abspath(SERVER_SCRIPT))
    sys.path.insert(0, server_dir)

    # 捕获退出信号
    def shutdown(sig, frame):
        print("\n\n   👋 正在关闭服务器...")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 导入并运行服务器
    try:
        import server as server_module
        server_module.main()
    except ImportError as e:
        print(f"错误: 无法启动服务器 - {e}")
        print("\n提示: 请确保在项目目录下运行: cd inspiration-collector && python3 launcher.py")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n   👋 已停止")
    except Exception as e:
        print(f"\n   ❌ 服务器异常: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
