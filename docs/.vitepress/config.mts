import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { escapeHtml, loadNovels, type Chapter } from '../../scripts/lib/novels.mjs'

const configDir = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))

// 正文就直接放在 docs/novels/<作品名>/ 里，配置直接读它，不经过任何中间产物：
// 目录和「上一章 / 下一章」都由同一份数据生成，不存在两边不同步的可能。
const contentDir = path.resolve(configDir, '../novels')
const siteFile = path.resolve(configDir, '../site.json')
const { site, novels } = loadNovels(contentDir, { siteFile })

if (novels.length === 0) {
  console.warn(`[vitepress] 在 ${contentDir} 里没有读到作品文件夹，导航会是空的。`)
}

/**
 * 目录项排版：章节号是小字淡色的一列，章节名在右侧对齐。
 * 侧边栏文字是 v-html 渲染的，所以这里能拆成两个 span；
 * 书名、章节名都必须转义（用 scripts/lib/novels.mjs 里那一份，避免两处实现跑偏）。
 */
const tocText = (chapter: Chapter) =>
  `<span class="toc-num">${escapeHtml(chapter.label)}</span>` +
  `<span class="toc-title">${escapeHtml(chapter.title)}</span>`

/**
 * 每部作品一套侧边栏，按路径前缀生效：
 * 读某本书时只看到这本书的目录，书架首页没有侧边栏。
 * 「上一章 / 下一章」也是按这份目录的顺序算的。
 */
const sidebar = Object.fromEntries(
  novels.map((novel) => [
    `/novels/${novel.slug}/`,
    [
      {
        text: escapeHtml(novel.title),
        items: novel.chapters.map((chapter) => ({
          text: tocText(chapter),
          link: chapter.href,
          docFooterText: chapter.pagerText
        }))
      },
      ...(novel.licensePage
        ? [{ text: '关于', items: [{ text: '作品许可', link: novel.licensePage, docFooterText: '作品许可' }] }]
        : [])
    ]
  ])
)

// 作品不多时，顶栏直接列出书名；作品多了就只留书架入口。
// 顶栏菜单项的 text 同样是 v-html 渲染的，所以书名要转义。
const nav = [
  { text: '书架', link: '/' },
  ...(novels.length <= 5
    ? novels.map((novel) => ({ text: escapeHtml(novel.title), link: novel.start }))
    : [])
]

/**
 * 作品文件夹名可以随你取（中文也行），网址统一用 novel.json 里的 slug。
 * 两者不一致时，用 rewrites 把「文件夹路径」映射成「slug 路径」，
 * 同时把 00- 开头的许可页固定成 <slug>/license。
 */
const rewrites: Record<string, string> = {}
for (const novel of novels) {
  if (novel.folder === novel.slug) {
    continue
  }
  for (const chapter of novel.chapters) {
    const from = `novels/${novel.folder}/${chapter.file}`
    rewrites[from] = `novels/${novel.slug}/${chapter.file}`
  }
  if (novel.licenseFile) {
    rewrites[`novels/${novel.folder}/${novel.licenseFile}`] = `novels/${novel.slug}/license.md`
  }
  rewrites[`novels/${novel.folder}/index.md`] = `novels/${novel.slug}/index.md`
}

// 章节页 / 许可页的 URL（用 slug 的那份），用来判断哪些页面该套小说排版
const chapterPages = new Map(
  novels.flatMap((novel) =>
    novel.chapters.map((chapter) => [`novels/${novel.slug}/${chapter.file}`, { chapter, novel }])
  )
)
const licensePages = new Set(
  novels.filter((novel) => novel.licenseFile).map((novel) => `novels/${novel.slug}/license.md`)
)

/**
 * 书架首页要给客户端一份「每本书有哪些章」的清单，用来把书卡从
 * 「开始阅读」换成「继续阅读 · 第5章」（theme/shelf.ts）。
 * markdown 里的 <script> 会被 VitePress 过滤掉，所以放在 <head> 里注入，
 * 而且只在首页注入，其它页面不带。
 */
const shelfData = novels.map((novel) => ({
  slug: novel.slug,
  start: novel.start,
  title: novel.title,
  chapters: novel.chapters.map((chapter) => ({
    href: chapter.href,
    label: chapter.label,
    title: chapter.title
  }))
}))

/** 站点根地址，拼 og:image / canonical 这些绝对地址用 */
const siteUrl = String(site.url || '').replace(/\/+$/, '')
const absolute = (href: string) => (siteUrl ? `${siteUrl}${href}` : href)

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: site.title,
  description: site.tagline,

  rewrites,

  // 去掉地址栏里的 .html：卡片 href 与 canonical 都是无扩展名的干净地址，
  // 若不开这项，VitePress 的路由会把站内跳转又补回 .html，出现两种写法并存。
  // 注意：这只影响客户端路由与 canonical，dist 里仍是 01-导语.html（CF Pages 会
  // 把 /x.html 308 到 /x，所以直链也一致）。
  cleanUrls: true,

  // _模板 这类下划线开头的文件夹不进站点
  srcExclude: ['novels/_*/**'],

  // 章节页自动加上 novel-chapter 类名，主题据此套中文小说排版（首行缩进、行高等）；
  // 顺带把本章字数、所属书名写进 frontmatter，页尾与分享卡都要用。
  transformPageData(pageData) {
    const info = chapterPages.get(pageData.relativePath)
    if (info) {
      pageData.frontmatter.pageClass = pageData.frontmatter.pageClass || 'novel-chapter'
      pageData.frontmatter.chapterWords = info.chapter.words
      pageData.frontmatter.novelTitle = info.novel.title
      return
    }
    if (licensePages.has(pageData.relativePath)) {
      pageData.frontmatter.pageClass = pageData.frontmatter.pageClass || 'novel-license'
    }
  },

  /**
   * 每个页面往 <head> 里补分享卡（og / twitter）与 canonical。
   * 章节页的 og:image 用所属作品的封面；首页用站点图标。
   */
  transformHead({ pageData }) {
    const path = pageData.relativePath
    const info = chapterPages.get(path)
    const canonical = absolute('/' + path.replace(/(^|\/)index\.md$/, '').replace(/\.md$/, ''))

    const title = info
      ? `${info.chapter.label ? info.chapter.label + '　' : ''}${info.chapter.title} · 《${info.novel.title}》`
      : pageData.frontmatter.title || site.title
    const description = info
      ? info.novel.tagline || info.novel.description || site.tagline
      : site.tagline
    const image = info?.novel.cover ? absolute(info.novel.cover) : absolute('/apple-touch-icon.png')

    const tags: Array<[string, Record<string, string>]> = [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:type', content: path.startsWith('novels/') ? 'article' : 'website' }],
      ['meta', { property: 'og:site_name', content: site.title }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:image', content: image }],
      ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: image }]
    ]

    // 书架首页额外带上章节清单（客户端「继续阅读」用）
    // 把 < 转义掉，书名/章节名里万一出现 </script> 也不会把脚本截断
    if (path === 'index.md') {
      const json = JSON.stringify(shelfData).replace(/</g, '\\u003c')
      tags.push(['script', {}, `window.__NOVEL_SHELF__=${json}`])
    }

    return tags
  },

  // 首屏脚本：在页面渲染前把读者选过的配色和阅读设置（字号/行距/字体）写好，
  // 这样刷新时不会先闪一下默认样式。没选过就用默认值。
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    // 订阅源：浏览器与阅读器会自动发现 /feed.xml
    ['link', { rel: 'alternate', type: 'application/rss+xml', title: `${site.title} 更新`, href: '/feed.xml' }],
    // 默认字体是宋体子集，提前拉一把，切换字体时少闪一下
    [
      'link',
      {
        rel: 'preload',
        href: '/fonts/noto-serif-sc-subset.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: ''
      }
    ],
    // 把站点配置（评论区参数等）交给客户端组件，省得再引一层依赖
    ['script', {}, `window.__NOVEL_SITE__=${JSON.stringify({ url: siteUrl, comment: site.comment || null })}`],
    [
      'script',
      {},
      [
        'try{',
        'var d=document.documentElement,s=localStorage.getItem(\'novel-color-scheme\');',
        // 白名单方式，避免 localStorage 被写入奇怪的值；green 是旧名字，映射到 orange
        "if(s==='green')s='orange';",
        "if(!(s==='warm'||s==='orange'||s==='blue')){",
        // 读者没明确选过：首页用淡橙红，其它页面用暖黄（和 SchemeSwitch 里的 pageDefault 一致）
        "var p=location.pathname.replace(/index\\.html$/,'');",
        "s=(p===''||/\\/$/.test(p))?'orange':'warm'",
        '}',
        "if(s!=='warm')d.classList.add('theme-'+s);",
        "var r=JSON.parse(localStorage.getItem('novel-reader-settings-v2')||'null');",
        "if(r){if(r.size)d.style.setProperty('--novel-reader-size',r.size+'px');",
        "if(r.leading)d.style.setProperty('--novel-reader-leading',String(r.leading));",
        "if(r.measure)d.style.setProperty('--novel-measure',r.measure+'px');",
        "if(r.font==='sans')d.classList.add('reader-sans')}",
        // 目录默认收起，而且不记忆——每进一个页面都从收起态开始。
        // 这里提前把 class 加上，避免首帧先渲染出展开的侧边栏、再「唰」地收回去。
        "d.classList.add('novel-sidebar-collapsed');",
        '}catch(e){}'
      ].join('')
    ]
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    // 顶栏站名左边的小图标，用的是同步脚本生成的站点图标
    logo: '/favicon.png',
    nav,
    sidebar,

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一章', next: '下一章' },

    // 404 文案（VitePress 内置支持，默认是英文的 PAGE NOT FOUND）
    notFound: {
      title: '这一页不存在',
      quote: '你要找的地址没有内容——也许是链接抄错了一个字，也许这一章还没写。',
      linkText: '回到书架',
      linkLabel: '回到书架'
    },

    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '章节目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    // 页脚文案在 docs/site.json 的 footer 里改；本站收录了别人的作品，
    // 所以默认说法是「版权归各自作者所有」
    footer: {
      message: site.footer?.message || '本站作品版权归各自作者所有，转载请注明出处',
      copyright: site.footer?.copyright ?? (site.author ? `© ${site.author}` : '')
    },

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索全书内容' },
          modal: {
            displayDetails: '显示详细列表',
            resetButtonTitle: '清除搜索',
            backButtonTitle: '关闭搜索',
            noResultsText: '没有找到相关内容：',
            footer: {
              selectText: '选择',
              selectKeyAriaLabel: '回车',
              navigateText: '切换',
              navigateUpKeyAriaLabel: '上箭头',
              navigateDownKeyAriaLabel: '下箭头',
              closeText: '关闭',
              closeKeyAriaLabel: 'esc'
            }
          }
        }
      }
    }
  }
})
