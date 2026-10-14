#!/usr/bin/env node
/**
 * 清掉构建缓存：白屏、样式/脚本不更新、改了配置不生效时，先跑这个再重启。
 *
 * 删的是两份纯缓存（都可以重新生成，不含任何正文）：
 *   docs/.vitepress/cache   Vite / VitePress 的依赖与转换缓存
 *   docs/.vitepress/dist    上次构建的输出
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

for (const target of ['docs/.vitepress/cache', 'docs/.vitepress/dist']) {
  const full = path.join(root, target)
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true })
    console.log('[clean] 已删除', target)
  }
}

console.log('[clean] 完成，重新跑一次 npm run docs:dev 即可')
