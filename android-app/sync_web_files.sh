#!/bin/bash
# 从灵感收藏家主项目同步最新前端文件到 Android 项目 assets
# 运行: bash sync_web_files.sh

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS_DIR="$(cd "$(dirname "$0")" && pwd)/app/src/main/assets"

echo "📦 同步前端文件到 Android assets..."
echo "  源: $PROJECT_DIR"
echo "  目标: $ASSETS_DIR"

cp "$PROJECT_DIR/index.html" "$ASSETS_DIR/"
cp "$PROJECT_DIR/manifest.json" "$ASSETS_DIR/"
cp "$PROJECT_DIR/sw.js" "$ASSETS_DIR/"
cp "$PROJECT_DIR/js/app.js" "$ASSETS_DIR/js/"
cp "$PROJECT_DIR/js/sync.js" "$ASSETS_DIR/js/"
cp "$PROJECT_DIR/js/icons.js" "$ASSETS_DIR/js/"
cp "$PROJECT_DIR/css/style.css" "$ASSETS_DIR/css/"

echo "✅ 同步完成"
ls -la "$ASSETS_DIR/" "$ASSETS_DIR/js/" "$ASSETS_DIR/css/"
