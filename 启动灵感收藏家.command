#!/bin/bash
# 灵感收藏家 - macOS 启动器
# 双击此文件即可启动服务器并打开浏览器

# 进入脚本所在目录
cd "$(dirname "$0")"

echo ""
echo "  ✨ 灵感收藏家 正在启动..."
echo "  📡 启动本地服务器..."

# 检查 Python
PYTHON=""
for cmd in python3 python3.13 python3.12 python3.11; do
    if command -v $cmd &>/dev/null; then
        PYTHON=$cmd
        break
    fi
done

if [ -z "$PYTHON" ]; then
    echo ""
    echo "  ❌ 错误: 未找到 Python 3"
    echo "  请先安装 Python 3: https://www.python.org/downloads/"
    echo ""
    echo "  按 Enter 键退出..."
    read
    exit 1
fi

echo "  使用: $($PYTHON --version)"

# 启动
$PYTHON launcher.py

echo ""
echo "  服务器已停止"
echo "  按 Enter 键关闭此窗口..."
read
