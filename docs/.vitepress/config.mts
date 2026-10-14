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

// 章节页的 URL（用 slug 的那份），用来判断哪些页面该套小说排版
const chapterPages = new Set(
  novels.flatMap((novel) => novel.chapters.map((chapter) => `novels/${novel.slug}/${chapter.file}`))
)

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: site.title,
  description: site.tagline,

  rewrites,

  // 教程自带的示例页面、以及 _模板 这类下划线开头的文件夹都不进站点
  srcExclude: ['markdown-examples.md', 'api-examples.md', 'test.md', 'novels/_*/**'],

  // 章节页自动加上 novel-chapter 类名，主题据此套中文小说排版（首行缩进、行高等）
  transformPageData(pageData) {
    if (chapterPages.has(pageData.relativePath)) {
      pageData.frontmatter.pageClass = pageData.frontmatter.pageClass || 'novel-chapter'
    }
  },

  // 首屏脚本：在页面渲染前把读者选过的配色和阅读设置（字号/行距/字体）写好，
  // 这样刷新时不会先闪一下默认样式。没选过就用默认值。
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    [
      'script',
      {},
      [
        'try{',
        "var d=document.documentElement,s=localStorage.getItem('novel-color-scheme');",
        // 白名单方式，避免 localStorage 被写入奇怪的值；green 是旧名字，映射到 orange
        "if(s==='green')s='orange';",
        "if(s==='orange'||s==='blue')d.classList.add('theme-'+s);",
        "var r=JSON.parse(localStorage.getItem('novel-reader-settings-v2')||'null');",
        "if(r){if(r.size)d.style.setProperty('--novel-reader-size',r.size+'px');",
        "if(r.leading)d.style.setProperty('--novel-reader-leading',String(r.leading));",
        "if(r.font==='sans')d.classList.add('reader-sans')}",
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
