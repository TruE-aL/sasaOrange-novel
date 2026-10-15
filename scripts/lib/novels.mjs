/**
 * 「正文」的解析逻辑：把每个作品文件夹读成站点需要的数据结构。
 *
 * 同步脚本（scripts/sync-content.mjs）和站点配置（docs/.vitepress/config.mts）共用这一份，
 * 所以「目录顺序、章节号、章节名、字数」在两边永远一致，也不会因为中间产物缺失而丢导航。
 */
import fs from 'node:fs'
import path from 'node:path'

/* ---------------- 小工具 ---------------- */

export const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch {
    return ''
  }
}

export const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

/** 生成 YAML 里安全的字符串；JSON 的双引号写法本身就是合法 YAML */
export const yaml = (value) => JSON.stringify(value)

/**
 * 转义 HTML。侧边栏与顶栏的文字都是 v-html 渲染的，书名/章节名会被当 HTML 解析，
 * 所以内容与属性两种场景都走这里：
 *   元素内容：`<span>${escapeHtml(title)}</span>`
 *   属性值：  `href="${escapeHtml(link)}"`
 * 单引号也一并转掉，避免以后有人把值放进单引号属性里时漏出去。
 */
export const escapeHtml = (value) => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(value).replace(/[&<>"']/g, (char) => map[char])
}

const stripQuotes = (value) => value.trim().replace(/^['"]|['"]$/g, '')
const prefixOf = (file) => (file.match(/^(\d+)/) || [])[1] || ''
export const naturalSort = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })

/* ---------------- 章节号与章节名 ----------------

   文件名「03-第一章.md」提供章节号（第一章），正文第一个「# 标题」提供章节名；
   两者完全相同（# 序章）时只显示一次。章节号统一显示成阿拉伯数字，
   因为「第十一章」这种四字数字在窄目录栏里会顶到章节名上。
------------------------------------------------- */

const SEPARATOR = /[\s·、,，.。:：\-—_]/
const normalize = (value) => value.replace(new RegExp(SEPARATOR.source, 'g'), '')

const CN_DIGIT = {
  零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9
}
const CN_UNIT = { 十: 10, 百: 100, 千: 1000 }

function cnToArabic(run) {
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

const toArabicLabel = (label) => label.replace(/[零一二三四五六七八九十百千两]+/g, cnToArabic)

/** 拆出正文部分（去掉 frontmatter），label / title / 字数都从这一份文本里算 */
const bodyOf = (raw) => raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '')

function readLabel(file, raw) {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const label = frontmatter?.[1].match(/^label:\s*(.+)$/m)
  if (label) return stripQuotes(label[1])
  return file.replace(/\.md$/, '').replace(/^\d+\s*[-_.、]\s*/, '')
}

function readTitle(raw) {
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const title = frontmatter?.[1].match(/^title:\s*(.+)$/m)
  if (title) return stripQuotes(title[1])
  const heading = bodyOf(raw).match(/^#\s+(.+)$/m)
  return heading ? heading[1].trim() : ''
}

/** 拆成 { 章节号, 章节名 }，供目录两栏排版和「上一章/下一章」使用 */
function splitLabel(file, raw) {
  const rawLabel = readLabel(file, raw)
  const label = toArabicLabel(rawLabel)
  const rawTitle = readTitle(raw)
  if (!rawTitle) return { label: '', title: label }
  if (!label) return { label: '', title: rawTitle }

  const normalizedLabel = normalize(label)
  const normalizedTitle = normalize(rawTitle)
  if (normalizedLabel === normalizedTitle) return { label: '', title: rawTitle }

  // 标题里自己写了章节号（「第一章 思念报复」）：把这一段剥掉，仍然分成两栏
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

/** 正文里的汉字数，不含标题行和 frontmatter */
function countWords(raw) {
  const body = bodyOf(raw).replace(/^#.*$/gm, '')
  return (body.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length
}

/* ---------------- 对外接口 ---------------- */

/** 书架分组：site.json 里可以改标题与顺序，novel.json 用 category 指定归属 */
const DEFAULT_SECTIONS = [
  { id: 'original', title: '我的作品', description: '我写的原创小说' },
  { id: 'recommend', title: '个人推荐书籍', description: '别人写的，我读过并想推荐' }
]

/**
 * 读取作品目录下的全部作品。
 * 一个子文件夹 = 一部作品；下划线或点开头的文件夹会被跳过（例如 _模板）。
 */
export function loadNovels(contentDir, options = {}) {
  const siteFile = options.siteFile || path.join(contentDir, 'site.json')
  const siteConfig = {
    title: '小说集',
    author: '',
    tagline: '',
    ...readJson(siteFile, {})
  }
  const sections =
    Array.isArray(siteConfig.sections) && siteConfig.sections.length > 0
      ? siteConfig.sections
      : DEFAULT_SECTIONS
  const site = { ...siteConfig, sections }

  const folders = fs.existsSync(contentDir)
    ? fs
        .readdirSync(contentDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
        .map((entry) => entry.name)
        .sort(naturalSort)
    : []

  const novels = []

  for (const folder of folders) {
    const sourceDir = path.join(contentDir, folder)
    const meta = readJson(path.join(sourceDir, 'novel.json'), {})
    const title = meta.title || folder
    // slug 决定网址，建议在 novel.json 里写拼音或英文；留空则用文件夹名
    const slug = String(meta.slug || folder).replace(/[/\\:*?"<>|]/g, '-')
    const base = `/novels/${slug}`

    const files = fs
      .readdirSync(sourceDir)
      .filter(
        (file) =>
          file.endsWith('.md') &&
          // index.md 是同步脚本生成的作品首页，不算正文
          file !== 'index.md' &&
          !file.startsWith('.') &&
          !file.startsWith('_')
      )
      .sort(naturalSort)

    const licenseFile = files.find((file) => prefixOf(file) === '00') || ''
    const chapterFiles = files.filter((file) => file !== licenseFile)
    if (chapterFiles.length === 0) continue

    const chapters = []
    const extras = []
    let words = 0

    for (const file of chapterFiles) {
      const filePath = path.join(sourceDir, file)
      const raw = readText(filePath)
      const { label, title: name } = splitLabel(file, raw)
      const text = name || label
      const listText = label ? `${label}　${text}` : text
      const chapterWords = countWords(raw)
      // 文件的最后修改时间，RSS 的 pubDate 用它（不额外维护「更新日期」字段）
      let mtime = 0
      try {
        mtime = fs.statSync(filePath).mtimeMs
      } catch {
        mtime = 0
      }
      chapters.push({
        file,
        label,
        title: text,
        href: `${base}/${file.replace(/\.md$/, '')}`,
        listText,
        pagerText: listText,
        words: chapterWords,
        mtime
      })
      if (!/^第\d+章/.test(label)) extras.push(label || text)
      words += chapterWords
    }

    const coverFile = meta.cover || 'cover.png'

    novels.push({
      folder,
      sourceDir,
      slug,
      base,
      title,
      // 分组：novel.json 里写 category，缺省属于第一组（原创作品）
      category: meta.category || sections[0].id,
      author: meta.author || site.author || '',
      tagline: meta.tagline || '',
      description: meta.description || '',
      status: meta.status || '',
      license: meta.license || '',
      licenseUrl: meta.licenseUrl || '',
      // 点书架上的书卡直接进第一章，没有作品首页这一层
      start: chapters[0].href,
      licenseFile,
      licensePage: licenseFile ? `${base}/license` : '',
      coverFile,
      cover: fs.existsSync(path.join(sourceDir, coverFile)) ? `/novels/${slug}/cover.jpg` : '',
      // 全书最近一次改动时间（章节文件 mtime 的最大值），RSS / sitemap 用
      updated: chapters.reduce((latest, chapter) => Math.max(latest, chapter.mtime), 0),
      chapters,
      stats: {
        chapters: chapters.filter((chapter) => /^第\d+章/.test(chapter.label)).length,
        words,
        extras
      }
    })
  }

  return { site, novels }
}
