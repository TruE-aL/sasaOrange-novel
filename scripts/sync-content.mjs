#!/usr/bin/env node
/**
 * 把「正文」同步成网站内容。一个文件夹 = 一部作品。
 *
 * 你只维护「正文」（源文件）：
 *   正文/site.json               站点级设置：站名、作者、首页一句话（可选）
 *   正文/<作品名>/novel.json      这部作品的信息：标题、简介、状态、许可（可选，缺省用文件夹名）
 *   正文/<作品名>/NN-名字.md      正文，文件名前缀决定目录顺序，也就是上一章/下一章的顺序
 *   正文/<作品名>/00-*.md         可选：该作品的许可声明页
 *   正文/<作品名>/cover.png       可选：封面
 *
 * 生成物（每次同步都会重写，不要手改）：
 *   docs/novels/<slug>/           章节、作品首页 index.md、许可页 license.md
 *   docs/public/novels/<slug>/    cover.jpg
 *   docs/index.md                 书架首页
 *   docs/.vitepress/novels.json   给 docs/.vitepress/config.mts 用的作品清单
 *
 * 手动同步：npm run docs:sync
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(root, '正文')
const docsDir = path.join(root, 'docs')
const novelsDir = path.join(docsDir, 'novels')
const publicNovelsDir = path.join(docsDir, 'public/novels')
const manifestPath = path.join(docsDir, '.vitepress/novels.json')
const homePath = path.join(docsDir, 'index.md')

const log = (...args) => console.log('[sync]', ...args)

/* ============================================================
   小工具
   ============================================================ */

const readText = (file) => {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch {
    return ''
  }
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return fallback
  }
}

/** 生成 YAML 里安全的字符串；JSON 的双引号写法本身就是合法 YAML */
const yaml = (value) => JSON.stringify(value)

const stripQuotes = (value) => value.trim().replace(/^['"]|['"]$/g, '')
const prefixOf = (file) => (file.match(/^(\d+)/) || [])[1] || ''
const naturalSort = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true })

/* ============================================================
   章节号与章节名

   文件名「03-第一章.md」提供章节号（第一章），正文第一个「# 标题」提供章节名；
   两者完全相同（# 序章）时只显示一次。章节号统一显示成阿拉伯数字，
   因为「第十一章」这种四字数字在窄目录栏里会顶到章节名上。
   ============================================================ */

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

function readLabel(file, sourceDir) {
  const raw = readText(path.join(sourceDir, file))
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const label = frontmatter?.[1].match(/^label:\s*(.+)$/m)
  if (label) return stripQuotes(label[1])
  return file.replace(/\.md$/, '').replace(/^\d+\s*[-_.、]\s*/, '')
}

function readTitle(file, sourceDir) {
  const raw = readText(path.join(sourceDir, file))
  const frontmatter = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const title = frontmatter?.[1].match(/^title:\s*(.+)$/m)
  if (title) return stripQuotes(title[1])
  const heading = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').match(/^#\s+(.+)$/m)
  return heading ? heading[1].trim() : ''
}

/** 拆成 { 章节号, 章节名 }，供目录两栏排版和「上一章/下一章」使用 */
function splitLabel(file, sourceDir) {
  const rawLabel = readLabel(file, sourceDir)
  const label = toArabicLabel(rawLabel)
  const rawTitle = readTitle(file, sourceDir)
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
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').replace(/^#.*$/gm, '')
  return (body.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length
}

/** 给生成的文件加 frontmatter，源文件里已有的字段不覆盖 */
function withFrontmatter(source, extra) {
  const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  const existing = frontmatter ? frontmatter[1] : ''
  const additions = Object.entries(extra)
    .filter(([key]) => !new RegExp(`^${key}:`, 'm').test(existing))
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')

  if (!additions) return source
  if (frontmatter) {
    return `---\n${additions}\n${existing}\n---\n${source.slice(frontmatter[0].length)}`
  }
  return `---\n${additions}\n---\n\n${source}`
}

/* ============================================================
   读取「正文」
   ============================================================ */

if (!fs.existsSync(contentDir)) {
  console.error(`[sync] 找不到「正文」文件夹：${contentDir}`)
  process.exit(1)
}

const site = {
  title: '小说集',
  author: '',
  tagline: '',
  ...readJson(path.join(contentDir, 'site.json'), {})
}

const novelFolders = fs
  .readdirSync(contentDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !entry.name.startsWith('_'))
  .map((entry) => entry.name)
  .sort(naturalSort)

if (novelFolders.length === 0) {
  console.error('[sync] 「正文」里还没有作品文件夹。结构应为 正文/<作品名>/01-第一章.md')
  process.exit(1)
}

fs.mkdirSync(novelsDir, { recursive: true })
fs.mkdirSync(publicNovelsDir, { recursive: true })

const manifest = []

/* ============================================================
   逐部作品生成
   ============================================================ */

for (const folder of novelFolders) {
  const sourceDir = path.join(contentDir, folder)
  const meta = readJson(path.join(sourceDir, 'novel.json'), {})
  const title = meta.title || folder
  // slug 决定网址，建议在 novel.json 里写拼音或英文；留空则用文件夹名
  const slug = String(meta.slug || folder).replace(/[/\\:*?"<>|]/g, '-')
  const outDir = path.join(novelsDir, slug)
  const base = `/novels/${slug}`

  const files = fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith('.md') && !file.startsWith('.') && !file.startsWith('_'))
    .sort(naturalSort)

  const licenseSource = files.find((file) => prefixOf(file) === '00')
  const chapterSources = files.filter((file) => file !== licenseSource)

  if (chapterSources.length === 0) {
    log(`作品「${title}」：没有找到章节文件，跳过`)
    continue
  }

  const chapters = []
  const extras = []
  let words = 0

  for (const file of chapterSources) {
    const raw = readText(path.join(sourceDir, file))
    const { label, title: chapterTitle } = splitLabel(file, sourceDir)
    const name = chapterTitle || label
    const listText = label ? `${label}　${name}` : name
    chapters.push({
      label,
      title: name,
      href: `${base}/${file.replace(/\.md$/, '')}`,
      listText,
      pagerText: listText
    })
    if (!/^第\d+章/.test(label || name)) {
      extras.push(label || name)
    }
    words += countWords(raw)
  }

  const novel = {
    slug,
    title,
    author: meta.author || site.author || '',
    tagline: meta.tagline || '',
    description: meta.description || '',
    status: meta.status || '',
    license: meta.license || '',
    licenseUrl: meta.licenseUrl || '',
    home: `${base}/`,
    licensePage: licenseSource ? `${base}/license` : '',
    cover: '',
    chapters,
    stats: {
      chapters: chapters.filter((chapter) => /^第\d+章/.test(chapter.label)).length,
      words,
      extras
    }
  }

  fs.mkdirSync(outDir, { recursive: true })

  // 清掉上一轮同步留下的、现在源里已经没有的页面
  const keep = new Set([...chapterSources, 'index.md', 'license.md'])
  for (const existing of fs.readdirSync(outDir)) {
    if (existing.endsWith('.md') && !keep.has(existing)) {
      fs.rmSync(path.join(outDir, existing))
    }
  }

  for (const file of chapterSources) {
    const raw = readText(path.join(sourceDir, file))
    // pageClass 让主题只给章节页套小说排版（首行缩进、行高等）
    fs.writeFileSync(path.join(outDir, file), withFrontmatter(raw, { pageClass: 'novel-chapter' }))
  }

  if (licenseSource) {
    const raw = readText(path.join(sourceDir, licenseSource))
    fs.writeFileSync(
      path.join(outDir, 'license.md'),
      withFrontmatter(raw, { title: '作品许可', pageClass: 'novel-license' })
    )
  } else {
    fs.rmSync(path.join(outDir, 'license.md'), { force: true })
  }

  fs.writeFileSync(path.join(outDir, 'index.md'), landingPage(novel))

  const coverSource = path.join(sourceDir, meta.cover || 'cover.png')
  if (fs.existsSync(coverSource)) {
    const coverDir = path.join(publicNovelsDir, slug)
    fs.mkdirSync(coverDir, { recursive: true })
    if (compressCover(coverSource, path.join(coverDir, 'cover.jpg'))) {
      novel.cover = `/novels/${slug}/cover.jpg`
    }
  }

  manifest.push(novel)
  log(
    `《${title}》→ docs/novels/${slug}/：${chapters.length} 篇、${novel.stats.chapters} 章、` +
      `约 ${(words / 10000).toFixed(1)} 万字${novel.cover ? '，含封面' : ''}`
  )
}

/* ============================================================
   作品首页 / 书架 / 清单
   ============================================================ */

/** docs/novels/<slug>/index.md 的内容 */
function landingPage(novel) {
  const { stats } = novel
  const lines = ['---', `title: ${yaml(novel.title)}`, 'pageClass: novel-home', '---', '']
  lines.push(`# ${novel.title}`, '')
  if (novel.tagline) lines.push(`> ${novel.tagline}`, '')
  if (novel.description) lines.push(novel.description, '')

  const metaParts = []
  if (novel.status) metaParts.push(`**${novel.status}**`)
  if (stats.chapters) metaParts.push(`${stats.chapters} 章`)
  metaParts.push(`约 ${(stats.words / 10000).toFixed(1)} 万字`)
  const extraText = stats.extras.length ? `，另有${stats.extras.join('、')}` : ''
  lines.push(`${metaParts.join(' · ')}${extraText}。`, '')

  const first = novel.chapters[0]
  lines.push('<p class="novel-actions">')
  lines.push(`  <a class="novel-btn primary" href="${first.href}">开始阅读</a>`)
  if (novel.licensePage) {
    lines.push(`  <a class="novel-btn" href="${novel.licensePage}">作品许可</a>`)
  }
  lines.push('</p>', '')

  lines.push('## 目录', '')
  novel.chapters.forEach((chapter, index) => {
    lines.push(`${index + 1}. [${chapter.listText}](${chapter.href})`)
  })
  lines.push('')

  return lines.join('\n')
}

/** docs/index.md（书架首页）的内容 */
function homePage() {
  const first = manifest[0]
  const lines = ['---', 'layout: home', '', 'hero:', `  name: ${yaml(site.title)}`]
  if (site.tagline) lines.push(`  tagline: ${yaml(site.tagline)}`)
  if (first) {
    lines.push('  actions:')
    lines.push(
      '    - theme: brand',
      `      text: ${yaml(`开始阅读《${first.title}》`)}`,
      `      link: ${first.home}`
    )
  }
  lines.push('', 'features:')
  for (const novel of manifest) {
    const parts = []
    if (novel.status) parts.push(novel.status)
    if (novel.stats.chapters) parts.push(`${novel.stats.chapters} 章`)
    parts.push(`约 ${(novel.stats.words / 10000).toFixed(1)} 万字`)
    const details = [parts.join(' · '), novel.tagline || novel.description]
      .filter(Boolean)
      .join('<br>')
    lines.push(`  - title: ${yaml(novel.title)}`)
    lines.push(`    details: ${yaml(details)}`)
    lines.push(`    link: ${novel.home}`)
    lines.push('    linkText: 开始阅读')
  }
  lines.push('---', '')

  return lines.join('\n')
}

/** 用 ImageMagick 把封面缩到 900px 宽、转成 jpg */
function compressCover(source, target) {
  const args = [source, '-resize', '900x>', '-strip', '-quality', '88', target]
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' })
      return true
    } catch {
      // 换下一个命令再试
    }
  }
  log('提示：没找到 ImageMagick（magick / convert），封面跳过压缩')
  return false
}

fs.writeFileSync(manifestPath, `${JSON.stringify({ site, novels: manifest }, null, 2)}\n`)
fs.writeFileSync(homePath, homePage())

// 旧版单作品结构的产物，清掉免得留下死链
for (const legacy of [
  path.join(docsDir, 'chapters'),
  path.join(docsDir, 'license.md'),
  path.join(docsDir, 'public/cover.jpg')
]) {
  fs.rmSync(legacy, { recursive: true, force: true })
}

log(`书架：${manifest.length} 部作品 → docs/index.md`)
