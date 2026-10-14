#!/usr/bin/env node
/**
 * 把「正文」文件夹同步成网站读取的内容。
 *
 *   正文/01-导语.md … 18-后记.md  → docs/chapters/同名文件（文件名顺序 = 目录顺序 = 上一页/下一页顺序）
 *   正文/00-*.md                 → docs/license.md（许可声明页，单独的页面，不进入阅读顺序）
 *   正文/cover.png               → docs/public/cover.jpg（首页封面，自动压缩，需要 ImageMagick）
 *
 * 「正文」是唯一的内容来源；docs/chapters、docs/license.md、docs/public/cover.jpg 都是生成物，
 * 不要直接编辑，重新同步会覆盖。
 *
 * 手动同步：npm run docs:sync
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, '正文')
const chaptersDir = path.join(root, 'docs/chapters')
const publicDir = path.join(root, 'docs/public')
const licenseTarget = path.join(root, 'docs/license.md')
const coverTarget = path.join(publicDir, 'cover.jpg')

const log = (...args) => console.log('[sync]', ...args)

if (!fs.existsSync(srcDir)) {
  console.error(`[sync] 找不到「正文」文件夹：${srcDir}`)
  process.exit(1)
}

const markdownFiles = fs
  .readdirSync(srcDir)
  .filter((file) => file.endsWith('.md') && !file.startsWith('.'))

const prefixOf = (file) => (file.match(/^(\d+)/) || [])[1] || ''

// 01-、02-… 是阅读顺序；00- 是许可声明，单独成页
const chapterFiles = markdownFiles
  .filter((file) => prefixOf(file) && prefixOf(file) !== '00')
  .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }))
const licenseFile = markdownFiles.find((file) => prefixOf(file) === '00')

if (chapterFiles.length === 0) {
  console.error('[sync] 「正文」里没有找到 01-、02-… 这样的章节文件')
  process.exit(1)
}

/* ---------- 章节 ---------- */

fs.mkdirSync(chaptersDir, { recursive: true })

const keep = new Set(chapterFiles)
let removed = 0
for (const existing of fs.readdirSync(chaptersDir)) {
  if (existing.endsWith('.md') && !keep.has(existing)) {
    fs.rmSync(path.join(chaptersDir, existing))
    removed++
  }
}

for (const file of chapterFiles) {
  fs.copyFileSync(path.join(srcDir, file), path.join(chaptersDir, file))
}
log(`章节：${chapterFiles.length} 篇 → docs/chapters/（清理旧文件 ${removed} 个）`)

/* ---------- 许可页 ---------- */

if (licenseFile) {
  const body = fs.readFileSync(path.join(srcDir, licenseFile), 'utf-8')
  // 补一个 frontmatter，让浏览器标签页和页面标题有个正经名字
  fs.writeFileSync(licenseTarget, `---\ntitle: 作品许可\n---\n\n${body}`)
  log(`许可页：${licenseFile} → docs/license.md`)
} else {
  log('许可页：没有找到 00- 开头的文件，跳过')
}

/* ---------- 封面 ---------- */

const coverSource = path.join(srcDir, 'cover.png')
if (fs.existsSync(coverSource)) {
  fs.mkdirSync(publicDir, { recursive: true })
  const resized = runImageTool(coverSource)
  if (resized) {
    log(`封面：cover.png → docs/public/cover.jpg（${(fs.statSync(coverTarget).size / 1024).toFixed(0)} KB）`)
  } else {
    log('封面：没找到 ImageMagick（magick / convert），已跳过，首页会少一张封面图')
  }
} else {
  log('封面：没有找到 正文/cover.png，跳过')
}

/** 用 ImageMagick 把封面缩到 900px 宽、转成 jpg；没有这个命令就返回 false */
function runImageTool(source) {
  const args = [source, '-resize', '900x>', '-strip', '-quality', '88', coverTarget]
  for (const bin of ['magick', 'convert']) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' })
      return true
    } catch {
      // 换下一个命令再试
    }
  }
  return false
}
