# StarPie 主页开发

本目录是独立的静态主页，不依赖 StarPie 的 C# 构建环境，也不需要安装前端依赖。现有 README.md 保留为项目介绍。

## 本地预览

需要 Node.js 20 或更新版本。

```powershell
npm run dev
# 指定端口
npm run dev -- --port 4322
```

默认访问 http://127.0.0.1:4321 。服务器仅监听本机，并只开放页面所需的静态文件。

## 检查与构建

```powershell
npm run check
npm test
npm run build
```

构建结果在 dist/；也可以直接部署根目录中的 index.html、styles/、scripts/、assets/ 和 .nojekyll。构建不会安装依赖或访问网络。dist/ 是生成目录，请勿手工放入其他文件。构建采用覆盖复制；移除源文件时也需要清理对应的旧构建产物。

## GitHub Pages

仓库包含自动部署工作流 `.github/workflows/deploy-pages.yml`，使用 GitHub 官方 Pages Actions 发布 `dist/`，不需要额外配置个人 Token。

首次发布需要在 GitHub 上完成一次设置：

1. 打开仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**，不要继续使用 Deploy from a branch。
3. 由维护者将主页源码和工作流一起提交、推送到 `main`。
4. 在 **Actions → Deploy GitHub Pages** 查看运行结果；部署成功后，`github-pages` 环境中会显示站点地址。

工作流行为：

- **向 main 推送**：语法检查 → 回归测试 → 静态构建 → 上传 dist/ → 发布到 Pages。
- **向 main 提交 Pull Request**：只检查、测试和构建，不上传发布产物，也不会部署网站。
- **手动运行**：可在 Actions 页面通过 Run workflow 触发；只有选择 main 才会执行发布，其他分支只做检查和构建。
- 默认只授予源码读取权限；只有发布任务拥有 `pages: write` 和 `id-token: write`，并依赖构建成功。
- 本项目没有第三方依赖或 lockfile，因此工作流直接运行 npm 脚本，不执行 npm install / npm ci，也不启用包管理器缓存。

根目录 `.nojekyll` 仍保留；采用上述工作流时只上传构建目录，不会将本地预览服务、测试代码或整个仓库当作站点发布。

本地检查、构建及工作流静态校验不等于线上部署成功。首次启用 Pages、推送代码、手动触发运行或修改环境保护规则，均需要维护者在 GitHub 上操作。

资源链接均使用相对路径，可部署在域名根目录或项目子目录。社交分享图片的域名写在 index.html 中；迁移站点时请一并修改。

## 文件结构

- index.html：完整的中文静态内容、导航、功能展示与下载入口。
- styles/main.css：深浅主题、响应式布局、轮盘玻璃材质及减少动态效果适配。
- scripts/preferences.js：首屏主题偏好读取；存储不可用时安全回退。
- scripts/i18n.js：中文和英文词典，新增内容时需要同时维护两套。
- scripts/menu-data.js：三组演示动作与轮盘几何计算。
- scripts/app.js：轮盘的鼠标/触摸/键盘操作、主题语言切换、外观预览、手机导航和 GIF 播放。
- scripts/dev.mjs / build.mjs：零依赖本地预览和静态构建。
- .github/workflows/deploy-pages.yml：main 自动发布、PR 检查与手动构建/发布。
- tests/site.test.mjs：文案一致性、资源/锚点、轮盘几何和本地服务器测试。
- tests/pages-workflow.test.mjs：发布分支限制、任务依赖、产物范围和最小权限回归检查。

## 内容与版本边界

功能和下载类别依据仓库现有 README 整理；不展示未经核实的星数、下载量或性能数字。安装版、独立便携版与轻量版的按钮都跳转到官方 Releases/latest，用户在 Assets 中选择实际安装包，不会猜测文件名。

插件系统与主题工作室按 README 中的 v1.8.0 Beta 状态标注；它们不是正式版能力的承诺。发布状态改变后，应同步维护双语文案和 FAQ。动作编辑与外观截图取自项目素材，可能与其他版本不同。

首屏轮盘是网页示意，只更新页面状态，不执行电脑上的程序、快捷键或系统动作。演示 GIF 仅在用户点击播放后加载，点击停止会恢复静态封面。

无 JavaScript 时仍可阅读中文内容、打开下载链接及 FAQ；轮盘互动、双语和主题切换需要 JavaScript。所有图片本地保存，无远程字体、统计脚本或第三方运行时请求。

## 设计与素材

参考 Kando 本地主页仓库的全屏首屏、交错功能展示和下载引导节奏。本站布局、轮盘绘制、样式和交互代码为重新实现，没有复制其樱花主题、品牌文案或第三方素材。

图标、动作配置截图、外观素材及演示 GIF 来自 StarPie 本地仓库。图标去除了白边并生成 WebP 与 favicon，截图压缩为 WebP；来源许可保存在 assets/STARPIE-LICENSE.txt。
