#!/usr/bin/env node
/**
 * 把「正文」同步成网站页面。一个文件夹 = 一部作品。
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
 *
 * 解析「正文」的逻辑在 scripts/lib/novels.mjs，站点的目录与翻页配置共用同一份。
 * 手动同步：npm run docs:sync
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadNovels, readText, yaml } from './lib/novels.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(root, '正文')
const docsDir = path.join(root, 'docs')
const novelsDir = path.join(docsDir, 'novels')
const publicNovelsDir = path.join(docsDir, 'public/novels')
const homePath = path.join(docsDir, 'index.md')

const log = (...args) => console.log('[sync]', ...args)

if (!fs.existsSync(contentDir)) {
  console.error(`[sync] 找不到「正文」文件夹：${contentDir}`)
  process.exit(1)
}

const { site, novels } = loadNovels(contentDir)

if (novels.length === 0) {
  console.error('[sync] 「正文」里还没有作品文件夹。结构应为 正文/<作品名>/01-第一章.md')
  process.exit(1)
}

fs.mkdirSync(novelsDir, { recursive: true })
fs.mkdirSync(publicNovelsDir, { recursive: true })

for (const novel of novels) {
  const outDir = path.join(novelsDir, novel.slug)
  fs.mkdirSync(outDir, { recursive: true })

  // 清掉上一轮同步留下的、现在源里已经没有的页面
  const keep = new Set([...novel.chapters.map((chapter) => chapter.file), 'index.md', 'license.md'])
  for (const existing of fs.readdirSync(outDir)) {
    if (existing.endsWith('.md') && !keep.has(existing)) {
      fs.rmSync(path.join(outDir, existing))
    }
  }

  // 章节：pageClass 让主题只给章节页套小说排版（首行缩进、行高等）
  for (const chapter of novel.chapters) {
    const raw = readText(path.join(novel.sourceDir, chapter.file))
    fs.writeFileSync(
      path.join(outDir, chapter.file),
      withFrontmatter(raw, { pageClass: 'novel-chapter' })
    )
  }

  // 许可页
  if (novel.licenseFile) {
    const raw = readText(path.join(novel.sourceDir, novel.licenseFile))
    fs.writeFileSync(
      path.join(outDir, 'license.md'),
      withFrontmatter(raw, { title: '作品许可', pageClass: 'novel-license' })
    )
  } else {
    fs.rmSync(path.join(outDir, 'license.md'), { force: true })
  }

  // 作品首页
  fs.writeFileSync(path.join(outDir, 'index.md'), landingPage(novel))

  // 封面
  if (novel.cover) {
    const coverDir = path.join(publicNovelsDir, novel.slug)
    fs.mkdirSync(coverDir, { recursive: true })
    compressCover(
      path.join(novel.sourceDir, novel.coverFile),
      path.join(coverDir, 'cover.jpg')
    )
  }

  log(
    `《${novel.title}》→ docs/novels/${novel.slug}/：${novel.chapters.length} 篇、` +
      `${novel.stats.chapters} 章、约 ${(novel.stats.words / 10000).toFixed(1)} 万字` +
      `${novel.cover ? '，含封面' : ''}`
  )
}

fs.writeFileSync(homePath, homePage(novels, site))

// 旧版单作品结构的产物，清掉免得留下死链
for (const legacy of [
  path.join(docsDir, 'chapters'),
  path.join(docsDir, 'license.md'),
  path.join(docsDir, 'public/cover.jpg')
]) {
  fs.rmSync(legacy, { recursive: true, force: true })
}

log(`书架：${novels.length} 部作品 → docs/index.md`)

/* ============================================================
   页面内容生成
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
function homePage(novels, site) {
  const first = novels[0]
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
  for (const novel of novels) {
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
