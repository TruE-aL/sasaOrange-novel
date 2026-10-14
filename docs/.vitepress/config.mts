import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'

// 章节所在的目录：docs/chapters
const configDir = import.meta.dirname || path.dirname(fileURLToPath(import.meta.url))
const chaptersDir = path.resolve(configDir, '../chapters')

/**
 * 目录里显示的文字 = 章节号 + 章节名。
 *
 * 章节号默认取自文件名（"03-第一章.md" → 「第一章」），章节名默认取正文第一个 "# 标题"
 * （"# 思念报复" → 「思念报复」），于是显示成「第一章 · 思念报复」。
 * 两者相同（"02-序章.md"/"# 序章"）或标题里已经包含章节号时，只显示一次，不会出现「序章 · 序章」。
 * 想手工指定时，在该文件 frontmatter 里写 label / title 覆盖即可。
 */
function readLabel(file: string) {
  const raw = readFile(file)
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const label = frontmatter?.[1].match(/^label:\s*(.+)$/m)
  if (label) {
    return stripQuotes(label[1])
  }
  // 文件名去掉前面的顺序号："03-第一章.md" → "第一章"
  return file.replace(/\.md$/, '').replace(/^\d+\s*[-_.、]\s*/, '')
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

/** 章节号与章节名之间的分隔符字符；比较时忽略它们 */
const SEPARATOR = /[\s·、,，.。:：\-—_]/
const normalize = (value: string) => value.replace(new RegExp(SEPARATOR.source, 'g'), '')

/**
 * 章节号显示成阿拉伯数字：第十一章 → 第11章。
 * 理由：「第十一章」这种四字中文数字在目录里会顶到章节名上（第十一章无风），
 * 换成数字后宽度稳定、间隔舒展，也更好扫读。
 * 序章、尾声、导语、后记这类不含数字的写法原样保留。
 */
const CN_DIGIT: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9
}
const CN_UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000 }

function cnToArabic(run: string) {
  let section = 0
  let number = 0
  for (const char of run) {
    if (char in CN_DIGIT) {
      number = CN_DIGIT[char]
    } else if (char in CN_UNIT) {
      section += (number || 1) * CN_UNIT[char]
      number = 0
    }
  }
  return String(section + number)
}

function toArabicLabel(label: string) {
  return label.replace(/[零一二三四五六七八九十百千两]+/g, (run) => cnToArabic(run))
}

/**
 * 把一章拆成「章节号」和「章节名」两部分，目录里会分别排版：
 *   章节号 → 小字、淡色，宽度固定，让所有章节名左对齐成一列
 *   章节名 → 正常字号，是目录里视觉上的主角
 *
 * 两种写法都认：
 *   文件名「02-序章.md」+ 标题「# 阿美寮」 → 序章 ｜ 阿美寮
 *   文件名「03-第一章.md」+ 标题「# 第一章 思念报复」 → 第一章 ｜ 思念报复（标题里的章节号会自动剥掉）
 * 「序章」「尾声」这类章节号和名字完全重复的页面，只保留名字，不显示两遍。
 */
function splitLabel(file: string) {
  const rawLabel = readLabel(file)
  const label = toArabicLabel(rawLabel)
  const rawTitle = readTitle(file)
  if (!rawTitle) return { label: '', title: label }
  if (!label) return { label: '', title: rawTitle }

  const normalizedLabel = normalize(label)
  const normalizedTitle = normalize(rawTitle)
  if (normalizedLabel === normalizedTitle) return { label: '', title: rawTitle }

  // 标题里已经写了章节号（"第一章 思念报复"）：把这一段剥掉，仍然分成两栏
  const matchedPrefix = [normalize(rawLabel), normalizedLabel]
    .filter(Boolean)
    .find((prefix) => normalizedTitle.startsWith(prefix))

  if (matchedPrefix) {
    let counted = 0
    let cut = rawTitle.length
    for (let i = 0; i < rawTitle.length; i++) {
      if (!SEPARATOR.test(rawTitle[i])) counted++
      if (counted === matchedPrefix.length) {
        cut = i + 1
        break
      }
    }
    const rest = rawTitle.slice(cut).replace(/^[\s·、,，.。:：\-—_]+/, '')
    if (rest) return { label, title: rest }
    return { label: '', title: rawTitle }
  }

  return { label, title: rawTitle }
}

function escapeHtml(value: string) {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }
  return value.replace(/[&<>"]/g, (char) => map[char])
}

/** 目录项：侧边栏的文字是用 v-html 渲染的，所以能分开放两个 span */
function tocText(file: string, index: number) {
  const { label, title } = splitLabel(file)
  const name = escapeHtml(title || `第 ${index + 1} 篇`)
  // 没有章节号的（导语、序章、尾声、后记）也留一个空编号位，好让所有条目左边缘对齐
  return `<span class="toc-num">${escapeHtml(label)}</span><span class="toc-title">${name}</span>`
}

/** 上一章 / 下一章按钮上是纯文本，不解析 HTML，用全角空格断句 */
function pagerText(file: string, index: number) {
  const { label, title } = splitLabel(file)
  if (!title) return label || `第 ${index + 1} 篇`
  return label ? `${label}　${title}` : title
}

/**
 * 扫描 chapters 目录，按文件名自然排序（01-导语.md、02-序章.md、03-第一章.md …）生成侧边栏。
 * 侧边栏的顺序就是「上一章 / 下一章」的顺序：上一章 = 上一个 md 文件，下一章 = 下一个 md 文件。
 * 注意：docs/chapters 由 `npm run docs:sync` 从「正文」同步而来，正文的顺序由文件名前缀决定。
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
    // 还没同步过「正文」：先跑一次 npm run docs:sync
    return []
  }

  return files.map((file, index) => {
    const slug = file.replace(/\.md$/, '')
    return {
      text: tocText(file, index),
      link: `/chapters/${slug}`,
      docFooterText: pagerText(file, index)
    }
  })
}

// 侧边栏生成一次，导航和目录共用同一份数据
const chapters = chapterSidebarItems()

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: 'zh-CN',
  title: '持续存在',
  description: '如果痛苦是真实的代价，你愿意拿虚假的安慰来换吗？',

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
    nav: [
      { text: '首页', link: '/' },
      { text: '开始阅读', link: chapters[0]?.link ?? '/' },
      { text: '作品许可', link: '/license' }
    ],

    // 顺序 = 文档顺序，也就是上一章 / 下一章的顺序
    sidebar: [
      {
        text: '目录',
        items: chapters
      }
    ],

    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一章', next: '下一章' },
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '章节目录',
    darkModeSwitchLabel: '外观',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',

    footer: {
      message: '本作品采用 <a href="/license">CC BY-NC-SA 4.0</a> 许可协议，转载请注明出处',
      copyright: ''
    },

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
    }
  }
})
