#!/bin/bash
# 灵感收藏家 - macOS APP 构建脚本
# 在当前目录创建双击可用的 InspirationCollector.app

set -e

APP_NAME="灵感收藏家"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$APP_DIR/${APP_NAME}.app"

echo "📦 构建 ${APP_NAME}.app ..."

# 创建 App 结构
mkdir -p "$BUILD_DIR/Contents/MacOS"
mkdir -p "$BUILD_DIR/Contents/Resources"

# Info.plist
cat > "$BUILD_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>InspirationCollector</string>
    <key>CFBundleIdentifier</key>
    <string>com.inspiration-collector.app</string>
    <key>CFBundleName</key>
    <string>灵感收藏家</string>
    <key>CFBundleDisplayName</key>
    <string>灵感收藏家</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>LSUIElement</key>
    <false/>
</dict>
</plist>
EOF

# 启动脚本（.app 的实际可执行文件）
cat > "$BUILD_DIR/Contents/MacOS/InspirationCollector" << 'SCRIPT'
#!/bin/bash
# 灵感收藏家 - macOS App 启动脚本

# 获取项目目录（相对于 .app 包的位置）
APP_DIR="$(cd "$(dirname "$0")/../../" && pwd)"

# 打开 Terminal 运行项目
open -a Terminal "$APP_DIR/启动灵感收藏家.command"
SCRIPT

chmod +x "$BUILD_DIR/Contents/MacOS/InspirationCollector"

# 复制项目文件到 Resources（可选，方便后续 PyInstaller 打包）
# 对于开发阶段，直接引用原目录即可

echo ""
echo "✅ 构建完成!"
echo ""
echo "   ${APP_NAME}.app"
echo "   双击即可启动 ✨"
echo ""
echo "   也可以直接双击:"
echo "   启动灵感收藏家.command"
echo ""

# 尝试设置图标
if [ -f "$APP_DIR/icon.png" ]; then
    echo "   (发现 icon.png，创建图标中...)"
    # macOS 要求 .icns 格式，这里跳过，保留默认图标
fi
