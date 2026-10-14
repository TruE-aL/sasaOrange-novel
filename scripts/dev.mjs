#!/usr/bin/env node
/**
 * 开发服务器：先同步一次，然后盯着 docs/novels 的变化自动重新同步，
 * 最后把 vitepress dev 跑起来。改完稿不用手动重启。
 *
 * 另外：增删章节（页面的增减）会让 VitePress 的本地搜索索引出错并使 dev 进程退出，
 * 所以这里在检测到「章节有增删」时主动重启一次 vitepress，只改文字则走正常的 HMR。
 *
 * 用法：npm run docs:dev  （多余参数会透传给 vitepress，例如 --port 5174）
 */
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadNovels } from './lib/novels.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contentDir = path.join(root, 'docs/novels')
const siteFile = path.join(root, 'docs/site.json')
const syncScript = path.join(root, 'scripts/sync-content.mjs')
const vitepressBin = path.join(root, 'node_modules/vitepress/bin/vitepress.js')

const log = (...args) => console.log('[dev]', ...args)

/** 页面的「结构指纹」：有哪些作品、每部作品有哪些章节 */
function structureSignature() {
  const { novels } = loadNovels(contentDir, { siteFile })
  return novels.map((novel) => `${novel.slug}:${novel.chapters.map((c) => c.file).join(',')}`).join('|')
}

function sync() {
  const result = spawnSync(process.execPath, [syncScript], { stdio: 'inherit', cwd: root })
  if (result.status !== 0) {
    log('同步失败，先按上面的报错改一下「正文」')
  }
}

/* ---------------- 开发服务器 ---------------- */

let child = null
let restarting = false

function startVitePress() {
  child = spawn(process.execPath, [vitepressBin, 'dev', 'docs', ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: root
  })
  child.on('exit', (code) => {
    if (restarting) return
    process.exit(code ?? 0)
  })
}

function restartVitePress(reason) {
  if (!child || restarting) return
  restarting = true
  log(`${reason}，重启开发服务器（重建搜索索引）`)
  child.kill('SIGTERM')
  setTimeout(() => {
    restarting = false
    startVitePress()
  }, 1000)
}

/* ---------------- 首次同步 + 监听 ---------------- */

sync()
let signature = structureSignature()

if (fs.existsSync(contentDir)) {
  let timer = null
  try {
    fs.watch(contentDir, { recursive: true }, (event, filename) => {
      if (!filename || /(^|[\\/])[.~]/.test(filename)) return
      // index.md 是脚本自己生成的作品首页，别因为写它就再触发一次同步
      if (path.basename(filename) === 'index.md') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        log(`「正文/${filename}」有改动，重新同步`)
        sync()
        const next = structureSignature()
        if (next !== signature) {
          signature = next
          restartVitePress('章节有增删')
        }
      }, 400)
    })
    log('已开始监听「正文」，改动会自动同步进站点')
  } catch (error) {
    log(`监听「正文」失败：${error.message}`)
  }
}

startVitePress()

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    restarting = true
    if (child) child.kill(signal)
    process.exit(0)
  })
}
