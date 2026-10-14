#!/usr/bin/env node
/**
 * 生成阅读用的中文衬线字体子集（思源宋体 / Noto Serif CJK SC）。
 *
 * 为什么要子集：完整的中文字体有 26MB，而站点正文只用到两千多个汉字，
 * 子集化之后是 400KB 左右，只有选了「宋体」的读者才会下载它。
 *
 * 用到的新字（例如新章节里出现的生僻字）不在子集里也没关系：浏览器会自动
 * 回退到系统衬线字体，字不会缺；想补齐就跑一次 `npm run fonts:build`。
 *
 * 依赖：Python 的 fontTools（含 pyftsubset）、woff2 支持。Termux 上通常
 * `pip install fonttools brotli` 就能装好。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'docs/public/fonts/noto-serif-sc-subset.woff2')
const charsFile = path.join(root, 'docs/.vitepress/cache/font-chars.txt')

/** 系统里可能存在的思源宋体（Android 的 Noto Serif CJK / 常见的本地字体目录） */
const CANDIDATES = [
  process.env.NOTOSERIF_PATH,
  '/system/fonts/NotoSerifCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc',
  path.join(root, '.fonts/NotoSerifCJK-Regular.ttc')
].filter(Boolean)

/** 界面文案里会出现的字，免得按钮/提示缺字 */
const UI_TEXT =
  '阅读设置字号行距字体默认黑体宋体重置关闭恢复紧凑标准宽松小大中' +
  '章节目录书架作品推荐个人原创小说约万字已完结连载语录集作者著' +
  '开始阅读上一章下一章回到顶部本页目录搜索清除没有找到相关内容' +
  '选择切换回车外观深浅色模式感谢你的到来我的小书屋'

const source = CANDIDATES.find((file) => fs.existsSync(file))
if (!source) {
  console.error('[font] 找不到思源宋体源文件，试过这些路径：')
  for (const file of CANDIDATES) console.error('   -', file)
  console.error('[font] 可以用环境变量指定：NOTOSERIF_PATH=/path/to/NotoSerifCJK-Regular.ttc npm run fonts:build')
  process.exit(1)
}

// 1. 收集站点里出现过的所有字符
const chars = new Set(UI_TEXT)
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') walk(file)
      continue
    }
    if (/\.(md|json)$/.test(entry.name)) {
      for (const char of fs.readFileSync(file, 'utf-8')) chars.add(char)
    }
  }
}
walk(path.join(root, 'docs'))

fs.mkdirSync(path.dirname(charsFile), { recursive: true })
fs.writeFileSync(charsFile, [...chars].filter((char) => char.trim()).sort().join(''))
console.log(`[font] 收集到 ${chars.size} 个字符，源字体：${source}`)

// 2. 子集化：TTC 里的第 3 个是简体（JP/KR/SC/TC/HK，索引 2）
fs.mkdirSync(path.dirname(output), { recursive: true })
try {
  execFileSync(
    'pyftsubset',
    [
      source,
      '--font-number=2',
      `--text-file=${charsFile}`,
      '--flavor=woff2',
      `--output-file=${output}`,
      '--layout-features=',
      '--no-hinting',
      '--desubroutinize'
    ],
    { stdio: 'inherit' }
  )
} catch (error) {
  console.error('[font] 子集化失败，检查有没有装 fontTools 与 brotli：pip install fonttools brotli')
  process.exit(1)
}

const size = fs.statSync(output).size
console.log(`[font] 生成完成：${path.relative(root, output)}（${(size / 1024).toFixed(0)} KB）`)
