# StarPie 赞助者页面

本目录是独立的静态赞助页。网页与 README 用的紧凑 SVG 共用 `data.json`，不需要第三方依赖、支付 API、远程字体或常驻后端。

## 当前范围

- 名单初始为空，不包含虚构赞助者、金额或付款入口。
- 按累计金额从高到低排序；同额按固定 `id` 的字符顺序排序，不随数据文件中的排列变化。
- 不分赞助等级，不按金额改变头像大小或样式。
- 网页采用宽松布局，显示完整名字；SVG 采用八列紧凑布局，过长名字省略，完整名字保留在 SVG 的标题中。
- 金额只用于排序，不写进生成的 HTML/SVG，但保留在公开的数据文件里。
- 中文/英文与深浅色切换只影响当前页面，并复用主页的偏好存储键；无 JavaScript 仍能查看中文名单、SVG 与项目链接。

## 隐私与金额

**本目录及其 Git 历史中的内容都应按公开信息处理。网页不显示金额，不等于金额保密。不要提交付款凭证、真实联系方式、订单号、Token 或未获本人同意的个人资料。删除当前文件里的数据也不会自动移除历史记录。**

`currency` 是整份名单唯一的记账货币，默认 `CNY`。`amountMinor` 使用该货币的最小记账单位：人民币 50.00 元写作 `5000`（分），不得使用浮点数。请人工汇总每位赞助者的累计金额，而非为每笔付款增加一条记录。

若收到不同币种，请维护者先确定统一记账方式；生成器不会混合币种、查询汇率或自动换算。名单只用于鸣谢，不是公开的支付流水或实时收款记录。

## 更新数据

在仓库根目录执行后文命令。`data.json` 的一条赞助者记录示意如下；这是文档示例，**不会进入实际名单**：

```json
{
  "id": "example-supporter",
  "name": "示例昵称",
  "amountMinor": 5000,
  "avatar": "avatars/example.png",
  "url": "https://github.com/example"
}
```

- `id`：稳定且唯一的小写标识，只包含字母、数字和短横线。调整昵称时不需要修改它。
- `name`：已获准公开的展示昵称，最多 80 个字符。
- `amountMinor`：同一货币下的累计金额，非负安全整数；仅用于降序排序。
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

`donationLinks` 默认是空数组。有经过确认的付款渠道后，再加入双语按钮：

```json
{
  "label": { "zh-CN": "在你的赞助平台支持", "en": "Support on your platform" },
  "url": "https://example.com/your-confirmed-page"
}
```

不要复制参考网站作者的收款链接，也不要把普通项目主页标为付款入口。

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

1. 校验本目录的数据和头像，重新生成网页与深浅色 SVG；无效资料会让构建失败。
2. 保持原主页的构建内容，将赞助页发布资源复制到 `dist/sponsor/`。
3. 仅发布 HTML、CSS、浏览器脚本、Logo、公开 JSON、两个 SVG，以及当前名单实际引用的头像；不发布模板、生成器、预览服务、测试或维护说明。
4. 只重建生成目录 `dist/sponsor/`，清除旧名单、退役头像与历史赞助页产物，不删除 `dist/` 或其他页面。

现有 `.github/workflows/deploy-pages.yml` 会在回归测试前运行生成器，然后通过全站构建把主页和赞助页一起上传为 `dist/` 产物。可以仅更新数据和头像，由 CI 重新绘制，无需机器人提交生成结果，也不需要额外的写仓库 Token。

本次只是接入本地构建和工作流配置，**不代表线上已经发布**。维护者仍需提交、推送到 main；Pages Source 应使用 GitHub Actions。PR 和非 main 分支的手动运行仍然只做验证和构建，不上传或部署。

主站的 `npm run dev` 仍保留原路由白名单；赞助页继续用本目录的独立预览服务器。页面导航与视觉未作改动。

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
