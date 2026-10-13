import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

// 章节所在的目录：docs/chapters
const configDir = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))
const chaptersDir = path.resolve(configDir, '../chapters')

/**
 * 目录里显示的文字 = 章节号（label）+ 章节名（title）。
 * 取值优先级：frontmatter 的 label / title → 正文第一个 "# 标题" → 文件名（去掉顺序前缀）。
 *
 * 例：
 *   label: 第 3 章 + title: 夜雨   → 「第 3 章 · 夜雨」
 *   只有 title: 序章                → 「序章」
 */
function readLabel(file: string) {
  const raw = readFile(file)
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const label = frontmatter?.[1].match(/^label:\s*(.+)$/m)
  return label ? stripQuotes(label[1]) : ''
}

function readTitle(file: string) {
  const raw = readFile(file)
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const frontmatterTitle = frontmatter?.[1].match(/^title:\s*(.+)$/m)
  if (frontmatterTitle) {
    return stripQuotes(frontmatterTitle[1])
  }
  // frontmatter 里没写 title 时，退而使用正文第一个一级标题
  const heading = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').match(/^#\s+(.+)$/m)
  return heading ? heading[1].trim() : ''
}

function readFile(file: string) {
  try {
    return fs.readFileSync(path.join(chaptersDir, file), 'utf-8')
  } catch {
    return ''
  }
}

function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '')
}

/** 兜底标题：去掉文件名前面的顺序号，例如 "03-第1章.md" → "第1章" */
function titleFromFileName(file: string) {
  return file.replace(/\.md$/, '').replace(/^\d+\s*[-_.、]?\s*/, '') || file.replace(/\.md$/, '')
}

/** 拼出目录文字：「第 3 章 · 夜雨」，缺哪个就只显示另一个 */
function displayText(file: string) {
  const label = readLabel(file)
  const title = readTitle(file) || titleFromFileName(file)
  if (label && title) return `${label} · ${title}`
  return title || label
}

/**
 * 扫描 chapters 目录，按文件名自然排序（01-导语.md、02-序章.md、03-第1章.md …）生成侧边栏。
 * 侧边栏的顺序就是「上一页 / 下一页」的顺序：上一页 = 上一个 md 文件，下一页 = 下一个 md 文件。
 * 文件名前面的数字只决定目录顺序，后面的名字随便改；内容也随便替换。
 */
function chapterSidebarItems() {
  let files: string[] = []
  try {
    files = fs
      .readdirSync(chaptersDir)
      .filter((file) => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_'))
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
  } catch {
    // 目录不存在时使用下面的默认占位
  }

  if (files.length === 0) {
    files = [
      '01-导语.md',
      '02-序章.md',
      ...Array.from({ length: 16 }, (_, i) => `${String(i + 3).padStart(2, '0')}-第${i + 1}章.md`),
      '19-尾声.md'
    ]
  }

  return files.map((file, index) => {
    const slug = file.replace(/\.md$/, '')
    const text = displayText(file) || `第 ${index + 1} 篇`
    return {
      text,
      link: `/chapters/${slug}`,
      docFooterText: text
    }
  })
}

// 侧边栏生成一次，导航和目录共用同一份数据
const chapters = chapterSidebarItems()

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: 'Novels',
  description: '我的原创小说',
  lastUpdated: true,

  // 教程自带的示例页面从站点里排除（文件本身保留，随时可以再启用）
  srcExclude: ['markdown-examples.md', 'api-examples.md', 'test.md'],

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '首页', link: '/' },
      { text: '开始阅读', link: chapters[0]?.link ?? '/' }
    ],

    // 顺序 = 文档顺序，也就是上一页 / 下一页的顺序
    sidebar: [
      {
        text: '目录',
        items: chapters
      }
    ],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一章', next: '下一章' },
    lastUpdated: { text: '最后更新于' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '章节目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '搜索', buttonAriaLabel: '搜索小说内容' },
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
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
