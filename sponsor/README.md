# StarPie 赞助者页面

本目录是独立的静态赞助页。网页与 README 用的紧凑 SVG 共用 `data.json`，不需要第三方依赖、支付 API、远程字体或常驻后端。

## 如何运行

安装 Node.js 20 或更高版本，在网站仓库根目录打开终端：

```sh
npm run sponsor:dev
```

此命令先生成页面，再启动仅本机访问的预览。打开 <http://127.0.0.1:4337/sponsor/>，
保留终端窗口；停止时按 Ctrl+C。本项目无第三方 npm 依赖，无需先安装依赖。
需要其他端口时运行 `npm run sponsor:dev -- --port 4338`。

只生成、检查或构建时：

```sh
npm run sponsor:generate
npm run sponsor:check
npm test
npm run build
```

`npm run dev` 继续用于项目主页，赞助页使用独立的 `sponsor:dev` 入口。
当前仓库只包含公开网站；私有管理台和数据库只在维护者本机运行，支持者通过邮箱联系。
本机已有的管理台仍从 <http://127.0.0.1:8766/admin.html> 访问，它不由上述命令启动。
网站单独运行时不提供资料提交或付款核验。

本批同步范围和待完成事项见 [同步说明](SYNC-NOTES.md)。

## 当前范围

- 名单初始为空，不包含虚构赞助者；爱发电入口使用已确认的 https://afdian.com/a/starpieproject。
- 按稳定公开 `id` 排序，不按金额排名，不随数据文件中的排列变化。
- 不分赞助等级，不按金额改变头像大小或样式。
- 网页采用宽松布局，显示完整名字；SVG 采用八列紧凑布局，过长名字省略，完整名字保留在 SVG 的标题中。
- v2 公开文件不接受金额、币种、订单、核对备注或 Token；金额只留在私有管理台。
- 中文/英文与深浅色切换只影响当前页面，并复用主页的偏好存储键；无 JavaScript 仍能查看中文名单、SVG 与项目链接。

## 隐私与金额

**本目录及其 Git 历史中的内容都应按公开信息处理。网页不显示金额，不等于金额保密。不要提交付款凭证、真实联系方式、订单号、Token 或未获本人同意的个人资料。删除当前文件里的数据也不会自动移除历史记录。**

当前采用 version 2 公开契约，顶层接受 version、updatedAt、donationLinks、sponsors，
以及可选 qrMethods、contactEmail。
每条赞助者资料仅接受 id、name，以及可选 avatar 和 url。
旧 v1 的 currency / amountMinor 不再接受；不要把旧金额文件复制进此公开仓库。
当前基线正式名单为空，因此本候选直接迁移为空 v2。
若其他分支已有真实 v1 数据，应先在私有位置保留账本，再经人工确认导出不含金额的公开资料。

本轮不自动累计金额、不按昵称合并支持者。同一人多笔订单的身份关联属于下一阶段。

## 更新数据

在仓库根目录执行后文命令。`data.json` 的一条赞助者记录示意如下；这是文档示例，**不会进入实际名单**：

```json
{
  "id": "example-supporter",
  "name": "示例昵称",
  "avatar": "avatars/example.png",
  "url": "https://github.com/example"
}
```

- `id`：稳定且唯一的小写标识，只包含字母、数字和短横线。调整昵称时不需要修改它。
- `name`：已获准公开的展示昵称，最多 80 个字符。
- `avatar`：可省略或为 `null`，这时使用昵称前两个字符。不支持外部头像 URL、SVG、路径跳转或符号链接。
- `url`：可省略或为 `null`；仅允许不包含凭据的 HTTPS 链接。

头像放在 `avatars/` 内，建议使用 256 × 256 的正方形 PNG/JPEG/WebP。文件名只使用英文字母、数字、短横线和下划线；单个头像不得超过 256 KiB，所有被引用的头像合计不得超过 4 MiB。SVG 会内嵌这些头像，README 展示时不再依赖远程头像服务。

按实际资料更新 `updatedAt`，然后生成并检查：

```sh
node sponsor/generate.mjs
node sponsor/generate.mjs --check
node --test sponsor/tests/sponsor.test.mjs
```

生成器只更新本目录下的 `index.html`、`sponsors-light.svg` 和 `sponsors-dark.svg`；结果确定且可重复。`--check` 不写文件，数据或模板变更但未重新生成时会失败。不要直接编辑生成文件。

`donationLinks` 已配置真实爱发电入口。增加其他已确认渠道时使用双语按钮：

```json
{
  "label": { "zh-CN": "在你的赞助平台支持", "en": "Support on your platform" },
  "url": "https://example.com/your-confirmed-page"
}
```

不要复制参考网站作者的收款链接，也不要把普通项目主页标为付款入口。

## 从私有控制台交付

原支持系统管理台的「网站公开名单」可以生成网站预览、下载网站资料。
ZIP 仅包含 sponsor/data.json、获准公开的 sponsor/avatars 图片与已启用的 sponsor/payment-codes 二维码，适配此生成器。
头像由控制台重新编码以移除元数据；金额即使在旧展示墙被允许公开，也不会进入此网站格式。

下载本身不会改写本仓库。交付前核对新增、修改、撤下名单，再由维护者在隔离候选中替换
数据与被引用图片，执行生成、测试与构建。主站构建只发布当前引用的头像与二维码，旧文件不会进入新站点产物。
公开 Git 历史中的既有文件不会因撤下当前名单而消失。
控制台当前按每条审核记录生成稳定编号，不自动合并同名用户；避免将同一支持者的重复资料一并发布。

本机网站预览使用同一个生成器，仅额外提供返回管理台的本机导航；该导航不会写入交付 ZIP。
网站候选原始名单仍为空；控制台资料不会自动写入、提交或发布。
公开页面提供支持入口、致谢名单和邮件联系说明。支持者网页申请已停用，维护者在本机控制台录入，不需要部署线上表单或 Webhook。

## 微信赞赏码与支付宝扫码

`qrMethods` 是 v2 的可选字段，最多包含 `wechat`、`alipay` 各一项：

```json
{
  "id": "wechat",
  "label": { "zh-CN": "微信赞赏码", "en": "WeChat" },
  "image": "payment-codes/wechat.png"
}
```

支付宝对应 `payment-codes/alipay.png`。图片只允许本地 PNG，单张最大 2 MiB；不支持远程图片、SVG、路径跳转或链接目录。
`image: null` 保留选择入口并显示「暂未开放」，不要求存在图片文件。
当前候选使用维护者在本机控制台启用并导出的微信、支付宝二维码；发布前仍需人工核对收款方。

优先由原支持系统控制台上传、启用和导出；它会保留比例、去除元数据并输出 PNG。
选择二维码是公开收款入口配置，需人工确认收款人正确。二维码面板无需 JavaScript，深浅主题和双语沿用网站设置。
生成器给图片 URL 添加基于内容的版本参数，替换图片后需重新生成并发布。
关闭时把 `image` 改为 `null`，新构建不复制该图片；已公开的 Git 历史和下载副本不会自动消失。

扫码与提交展示资料都不代表付款成功。微信、支付宝到账仍由维护者人工核对，公开展示单独授权。
## 邮件联系与本机管理

公开联系邮箱为 `erisnebula09@gmail.com`，配置在 data.json 的 `contactEmail` 中。
页面说明支持者可通过邮件申请加入、修改昵称/头像/主页，或移除展示。公开展示完全自愿，未联系者保持匿名。
维护者核对支持记录与公开授权后，在独立本机控制台手动新增或更新，再导出公开资料包。

邮箱只接受普通邮箱地址，不允许附加主题、抄送或换行参数；未配置时明确显示尚未开放。
旧 `profileFormUrl: null` 可以作为迁移输入，非空值会拒绝，避免继续生成已停用的网页表单入口；新公开数据不再输出该字段。
旧的网页提交接口已停用，不会新增申请；原有记录保留供维护者处理。

GitHub Pages 承载静态页面，使用默认 github.io 地址即可。当前不需要独立服务器、自购域名或长期在线的电脑。
本机控制台随用随开，负责手动管理、核对和导出；爱发电主动查询为可选能力，不影响微信/支付宝人工流程。
Token、付款凭证、支持者来信地址和私有备注不进入公开仓库。邮件联系不意味着自动公开或自动确认付款。

维护者更新后执行生成、测试与构建，审核后再单独提交和发布。现有主页、根 README 和部署权限保持原样。

## 本地预览

```sh
node sponsor/server.mjs
# 或者 node sponsor/server.mjs --port 4338
```

打开 `http://127.0.0.1:4337/sponsor/`。独立预览服务器仅绑定本机，并只开放页面必需的文件和公开数据；不会开放源码、测试、模板或仓库元数据。它不提供主页，所以预览时“返回主页”不模拟正式首页。修改数据后需要重新生成，再刷新浏览器。

该服务器与根目录的 `npm run dev` 独立，不会占用主页默认端口或改变其文件白名单。

## GitHub Pages 部署（已接入现有流程）

目标发布地址为 `https://star-pie.github.io/sponsor/`。主页与赞助页使用同一个 Pages 站点、同一个发布产物，不额外创建部署任务。

根目录的 `npm run build` 现在会：

1. 校验本目录的数据、头像和二维码，重新生成网页与深浅色 SVG；无效资料会让构建失败。
2. 保持原主页的构建内容，将赞助页发布资源复制到 `dist/sponsor/`。
3. 仅发布 HTML、CSS、浏览器脚本、Logo、公开 JSON、两个 SVG，以及当前实际引用的头像与二维码；不发布模板、生成器、预览服务、测试或维护说明。
4. 只重建生成目录 `dist/sponsor/`，清除旧名单、退役头像与历史赞助页产物，不删除 `dist/` 或其他页面。

现有 `.github/workflows/deploy-pages.yml` 会在回归测试前运行生成器，然后通过全站构建把主页和赞助页一起上传为 `dist/` 产物。可以仅更新数据和头像，由 CI 重新绘制，无需机器人提交生成结果，也不需要额外的写仓库 Token。

本次只是接入本地构建和工作流配置，**不代表线上已经发布**。维护者仍需提交、推送到 main；Pages Source 应使用 GitHub Actions。PR 和非 main 分支的手动运行仍然只做验证和构建，不上传或部署。

主站的 `npm run dev` 仍保留原路由白名单；赞助页继续用本目录的独立预览服务器。主站页面与导航保持原样。

## README 中引用

以下是部署成功后的预期用法；本地构建通过并不表示这些地址已经上线：

```html
<a href="https://star-pie.github.io/sponsor/">
  <picture>
    <source media="(prefers-color-scheme: dark)"
            srcset="https://star-pie.github.io/sponsor/sponsors-dark.svg">
    <img alt="StarPie supporters"
         src="https://star-pie.github.io/sponsor/sponsors-light.svg">
  </picture>
</a>
```

README 外层链接打开完整赞助页。SVG 作为 `<img>` 嵌入时，不依赖其中的个人链接可交互；网页名单则为每位提供了个人链接的赞助者提供独立可访问的入口。
