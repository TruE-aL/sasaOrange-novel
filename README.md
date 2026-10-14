# sasaOrange 的小说站

用 VitePress 搭的小说站，可以放多部作品。**正文只维护 `正文/` 这一个文件夹**，
网站内容（书架首页、各作品的页面、目录、字数）都由它同步生成。

## 日常使用

```bash
npm run docs:dev      # 本地预览（会先自动同步「正文」），默认 http://localhost:5173
npm run docs:build    # 构建静态站到 docs/.vitepress/dist
npm run docs:preview  # 预览已构建的站点
npm run docs:sync     # 只做同步，不启动服务
```

写完新章节后跑 `docs:dev` 或 `docs:build` 就会自动同步，不需要手动复制文件。

## 目录结构（一个文件夹 = 一部作品）

```
正文/
  site.json                 站点级设置：站名、作者、首页一句话
  _模板/                     新作品从这里复制（下划线开头，同步时会跳过）
  持续存在/                  作品文件夹，名字随意
    novel.json              这部作品的信息：标题、简介、状态、许可
    01-导语.md … 18-后记.md   正文，文件名前缀决定目录顺序
    00-作品许可证（网站）.md   可选的许可声明页
    cover.png               可选封面
```

对应到网站：

| 「正文」里的东西 | 网站上的位置 |
| --- | --- |
| `正文/<作品>/NN-*.md` | `/novels/<slug>/NN-*`，每部作品一套独立目录和「上一章/下一章」 |
| `正文/<作品>/00-*.md` | `/novels/<slug>/license`，显示在该作品目录的「关于」分组里 |
| `正文/<作品>/novel.json` | `/novels/<slug>/` 作品首页（简介、章数、字数、目录） |
| `正文/<作品>/cover.png` | `docs/public/novels/<slug>/cover.jpg`，已压缩到 900px 宽 |
| 全部作品 | `/` 书架首页 |

`docs/novels/`、`docs/public/novels/`、`docs/index.md`、`docs/.vitepress/novels.json`
都是生成物，重新同步会覆盖，别直接改。

## 加一部新作品

1. 复制 `正文/_模板/` 成 `正文/<新书名>/`；
2. 改 `novel.json`（`slug` 决定网址，建议用拼音或英文，**发布后不要改**）；
3. 把章节按 `01-第一章.md`、`02-第二章.md`…… 命名放进去，每篇正文第一个 `# 标题` 是章节名；
4. 跑 `npm run docs:dev`，书架首页会自动多出一张卡片。

章节数量不限，顺序永远是「文件名前缀小的在前」。
想在中间插一章，就在那个编号上插，再把后面的文件依次顺延。

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
- 章节号和章节名完全重复时只显示名字（`# 序章` 就是「序章」）
- 标题里自己写了章节号（`# 第一章 思念报复`）会自动剥掉，仍按「第1章 ｜ 思念报复」显示
- 想手工指定，就在那篇开头加 frontmatter：

  ```yaml
  ---
  label: 第1章
  title: 思念报复
  ---
  ```

样式在 `theme.css` 的 `.toc-num` / `.toc-title`，想换成上下两行、或者只留章节名，改这几条规则即可。

## 阅读配色

站里有两套配色，顶栏右侧的两个小圆点可以切换（手机上展开右上角菜单，在菜单最下方），
选择记在浏览器的 localStorage 里，每台设备各记各的。

- **暖黄（默认）**：米黄纸感底色 + 琥珀色强调，长时间阅读不刺眼
- **淡蓝**：与作品许可页同一套蓝

色值和明暗模式都在 `docs/.vitepress/theme/theme.css` 里：
`:root` / `.dark` 是暖黄，`html.theme-blue` / `html.theme-blue.dark` 是淡蓝。
想换默认色系，改 `docs/.vitepress/config.mts` 里 `head` 那段防闪烁脚本即可。

## 字数与章数

书架卡片、作品首页上的「14 章 · 约 2.9 万字」由同步脚本统计（汉字数，不含标题行），
写作进度变化后重新构建就会更新，不用手改。

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
