import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
import { loadNovels, type Chapter } from '../../scripts/lib/novels.mjs'

const configDir = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))

// 直接读「正文」，不经过任何中间产物：
// 目录和「上一章 / 下一章」都由同一份数据生成，不存在两边不同步的可能。
const contentDir = path.resolve(configDir, '../../正文')
const { site, novels } = loadNovels(contentDir)

if (novels.length === 0) {
  console.warn(`[vitepress] 在 ${contentDir} 里没有读到作品文件夹，导航会是空的。`)
}

const escapeHtml = (value: string) => {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return value.replace(/[&<>"]/g, (char) => map[char])
}

/**
 * 目录项排版：章节号是小字淡色的一列，章节名在右侧对齐。
 * 侧边栏文字是 v-html 渲染的，所以这里能拆成两个 span。
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
        text: novel.title,
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

// 作品不多时，顶栏直接列出书名；作品多了就只留书架入口
const nav = [
  { text: '书架', link: '/' },
  ...(novels.length <= 5 ? novels.map((novel) => ({ text: novel.title, link: novel.home })) : [])
]

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: site.title,
  description: site.tagline,

  // 教程自带的示例页面从站点里排除（文件本身保留，随时可以再启用）
  srcExclude: ['markdown-examples.md', 'api-examples.md', 'test.md'],

  // 配色：默认暖黄（护眼），读者选过淡蓝才加 theme-blue，
  // 这段脚本在首屏渲染前执行，切换色系时不会闪一下
  head: [
    [
      'script',
      {},
      "try{if(localStorage.getItem('novel-color-scheme')==='blue')document.documentElement.classList.add('theme-blue')}catch(e){}"
    ]
  ],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav,
    sidebar,

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一章', next: '下一章' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '章节目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    footer: {
      message: `本站作品版权归 ${site.author || '作者'} 所有，转载请保留出处`,
      copyright: site.author ? `© ${site.author}` : ''
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
