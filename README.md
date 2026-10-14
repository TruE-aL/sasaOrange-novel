# 《持续存在》阅读站

用 VitePress 搭建的小说阅读站。**正文只维护 `正文/` 这一个文件夹**，网站内容由它同步生成。

## 日常使用

```bash
npm run docs:dev      # 本地预览（会自动先同步「正文」），默认 http://localhost:5173
npm run docs:build    # 构建静态站点到 docs/.vitepress/dist
npm run docs:preview  # 预览已构建的站点
npm run docs:sync     # 只做同步，不启动服务
```

写完新章节后，跑 `docs:dev` 或 `docs:build` 就会自动同步，不需要手动复制文件。

## 文件对应关系

| 正文里的文件 | 网站里的位置 | 说明 |
| --- | --- | --- |
| `01-导语.md` … `18-后记.md` | `docs/chapters/` | 文件名前缀决定目录顺序，也就是「上一章 / 下一章」的顺序 |
| `00-作品许可证（网站）.md` | `docs/license.md` | 单独的许可页，不进入阅读顺序 |
| `cover.png` | `docs/public/cover.jpg` | 首页封面，同步时自动压缩到 900px 宽 |

`docs/chapters/`、`docs/license.md`、`docs/public/cover.jpg` 都是生成物，重新同步会覆盖，别直接改。

## 目录上显示的名字

目录项分成两截排版，像书前的目录页：

```
序章      阿美寮
第1章     思念报复
第11章    无风
```

- 章节号默认取文件名（`03-第一章.md` → 第一章），显示时统一转成阿拉伯数字（`第十一章` → `第11章`），
  这样在窄目录栏里不会顶到章节名上
- 章节名默认取正文里第一个 `# 标题`（`# 思念报复` → 思念报复）
- 章节号是小号淡色、定宽的一列，章节名在它右侧对齐；两者完全重复时只显示名字（`# 序章` 就是「序章」）
- 如果标题里自己写了章节号（`# 第一章 思念报复`），那一段会自动剥掉，仍按「第1章 ｜ 思念报复」显示
- 样式在 `theme.css` 的 `.toc-num` / `.toc-title`，想换成上下两行、或者只留章节名，改这几条规则即可

想手工指定，就在那个 md 开头加 frontmatter：

```yaml
---
label: 第一章
title: 思念报复
---
```

## 新增或调整章节

在 `正文/` 里按 `NN-名字.md` 新建文件，`NN` 决定它在目录里的位置，横线后面的名字随便取。
例如要在第三章（`05-第三章.md`）和第四章（`06-第四章.md`）之间插一章，就新建
`06-新章名.md`，再把原来的 `06-第四章.md` 到 `18-后记.md` 依次顺延成 `07-`、`08-`……

## 阅读配色

站里有两套配色，顶栏右侧的两个小圆点可以切换（手机上展开右上角菜单，在菜单最下方），
选择记在浏览器的 localStorage 里，每台设备各记各的。

- **暖黄（默认）**：米黄纸感底色 + 琥珀色强调，长时间阅读不刺眼
- **淡蓝**：与作品许可页同一套蓝

色值和明暗模式都在 `docs/.vitepress/theme/theme.css` 里：
`:root` / `.dark` 是暖黄，`html.theme-blue` / `html.theme-blue.dark` 是淡蓝。
想换默认色系，改 `docs/.vitepress/config.mts` 里 `head` 那段防闪烁脚本即可。

## 首页的章数与字数

首页那句「正文共 14 章，另有导语、序章、尾声、后记，约 2.9 万字」是 `docs/index.md` 里的
`<NovelStats />` 组件渲染的，数字在构建时由 `config.mts` 从 `docs/chapters` 统计后注入，
汉字总数不含标题行。写多少章、多少字都不用手动改，重新构建即可。

## 部署

项目根目录的 `wrangler.toml` 里已经写好 Cloudflare Pages 的配置：

```toml
name = "sasaorange-novel"                  # 决定默认域名 sasaorange-novel.pages.dev
pages_build_output_dir = "docs/.vitepress/dist"
```

两种发布方式：

1. **本地发布**：`npx wrangler login` 登录一次，然后 `npm run docs:deploy`
   （等于 `npm run docs:build && npx wrangler pages deploy`）。
   首次如果提示项目不存在，先跑一次 `npx wrangler pages project create sasaorange-novel`。
2. **Pages 连 Git 仓库**：在 Cloudflare 控制台选构建命令 `npm run docs:build`、
   输出目录 `docs/.vitepress/dist`。这种方式下构建环境没有 ImageMagick，
   同步脚本会跳过封面压缩并打印一行提示，不影响构建。

`name` 决定了默认域名，首次部署后不能改，想换的话在部署前改。
