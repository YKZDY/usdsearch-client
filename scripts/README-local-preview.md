# 🎭 本地预览 & i18n 测试指南

## 快速开始

### 方法 1: 使用启动脚本（推荐）

**PowerShell:**
```powershell
# 默认启动（英文界面）
.\scripts\dev-preview.ps1

# 默认中文界面
.\scripts\dev-preview.ps1 -Chinese

# 自定义端口
.\scripts\dev-preview.ps1 -Port 3000

# 不自动打开浏览器
.\scripts\dev-preview.ps1 -NoBrowser
```

**CMD / 双击:**
```
scripts\dev-preview.bat
```

### 方法 2: 手动启动

```bash
cd web
npm install          # 首次需要安装依赖
npm start            # 启动开发服务器
```

访问 http://localhost:3210

---

## 🔧 工作原理

| 文件 | 作用 |
|------|------|
| `web/src/setupProxy.js` | Mock API 代理 - 拦截所有后端请求，返回模拟数据 |
| `web/.env.development.local` | 本地开发环境变量（端口、Mock 服务器配置等） |
| `scripts/dev-preview.ps1` | PowerShell 一键启动脚本 |
| `scripts/dev-preview.bat` | Windows CMD 一键启动脚本 |

### Mock API 覆盖的端点

- `POST /search_hybrid` — 混合搜索（返回模拟搜索结果）
- `POST /search` — 普通搜索
- `GET /info/backend/storage` — 后端存储信息
- `GET /info/plugins` — 插件列表
- `GET /image` — 缩略图（返回 SVG 占位图）
- `GET /asset/dependencies` — 资产依赖关系
- `GET /asset/usd_properties` — USD 属性
- `GET /asset/tags` — 标签
- `POST /asset/reindex` — 重新索引
- `GET /asset/plugin_statuses` — 插件状态

### 语言切换

- 在界面右上角点击 **"中文"** / **"EN"** 按钮即可切换
- 语言偏好自动保存到 localStorage

---

## 🚫 如何禁用 Mock 模式

如果需要连接真实后端，只需：

1. **删除或重命名** `web/src/setupProxy.js`
2. 在 `web/.env.development.local` 中设置 `REACT_APP_API_URL=http://your-backend:port`
3. 重启开发服务器

---

## 📝 注意事项

- `setupProxy.js` 仅在 **开发模式** (`npm start`) 下生效，不影响生产构建
- `.env.development.local` 已被 `.gitignore` 排除，不会被提交
- Mock 数据每次搜索都会随机生成，用于测试各种 UI 状态
