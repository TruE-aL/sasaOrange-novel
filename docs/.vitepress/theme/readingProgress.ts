import {
  currentRoutePath,
  normalizePath,
  onNavigationEnd,
  onNavigationStart,
  type VitePressRouter
} from './navigation'

/**
 * 阅读进度记忆：把每章的滚动位置存进 localStorage，下次回到这一章接着读。
 *
 * 几条规则（都是为了避免「奇怪地回到中间」）：
 * - 只记正文页：书架首页、作品许可页这类不记
 * - 点「上一章 / 下一章」时不恢复：那种情况读者通常想看新章节的开头
 * - 带 #锚点 的链接不恢复：交给 VitePress 自己定位到锚点
 * - 已经滚到页尾（读完了）就清掉记录，下次从开头开始
 *
 * 切页时机借 theme/navigation.ts 的统一钩子（VitePress 2 自带路由，没有 vue-router 的 beforeEach）。
 */
export const PROGRESS_STORAGE_KEY = 'novel-progress'

/**
 * 「已读」单独存一份，和阅读位置分开。
 *
 * 为什么要分开：这两件事的语义是相反的。
 *   · novel-progress 记「读到哪儿了」——读到底反而要清掉，下次从头读；
 *   · novel-read     记「读没读完」——读到底正是要记下来的那一刻。
 * 之前把「已读」从 progress 反推，于是「在章末点下一章」这条最常见的路径
 * 恰好把记录清了，目录里的小点就不见了。现在各管各的。
 */
export const READ_STORAGE_KEY = 'novel-read'
/** 顶部进度条用的百分比 0–100。（纯函数，放在这里是因为它和阅读进度同属一件事） */
export function progressPercent(scrollTop: number, scrollHeight: number, innerHeight: number) {
  const max = scrollHeight - innerHeight
  if (!(max > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)))
}

/**
 * 「某一章刚刚读完」的回调表。
 *
 * shelf.ts 需要在这个时刻即时把目录小点刷出来（不等切页），
 * 但它已经 import 了本模块，这里再 import 回去就成环了。
 * 所以反过来：由 shelf 注册回调，本模块在读完时调用，方向单向。
 */
type ReadListener = (path: string) => void
const readListeners: ReadListener[] = []

export function onChapterRead(listener: ReadListener) {
  readListeners.push(listener)
}

function emitRead(path: string) {
  for (const listener of readListeners) {
    try {
      listener(path)
    } catch (error) {
      console.error('[novel] 已读回调出错：', error)
    }
  }
}

/** 太靠上（不足这么多像素）就不必恢复 */
const MIN_RESTORE = 120
/** 距页尾这么近就算读完了 */
const FINISHED_GAP = 40
/** 最多记多少章，超出就丢掉最早的 */
const MAX_ENTRIES = 120
/** 内容（图片、字体）还没撑开时，重试几次 */
const MAX_TRIES = 8
const RETRY_DELAY = 150

type Entry = { path: string; y: number }

function read(): Entry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item) => item && typeof item.path === 'string' && typeof item.y === 'number')
  } catch {
    return []
  }
}

function write(entries: Entry[]) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)))
  } catch {
    // 隐私模式写不了就算了
  }
}

function save(path: string, y: number) {
  const entries = read().filter((item) => item.path !== path)
  entries.push({ path, y: Math.round(y) })
  write(entries)
}

function readOne(path: string): number | null {
  const entry = read().find((item) => item.path === path)
  return entry ? entry.y : null
}

function clear(path: string) {
  write(read().filter((item) => item.path !== path))
}

/** 读过的章节路径（存进来时就统一了写法，取出来可直接比对） */
export function readPaths(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
  } catch {
    return []
  }
}

function writeRead(paths: string[]) {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(paths.slice(-MAX_ENTRIES)))
  } catch {
    // 隐私模式写不了就算了
  }
}

/** 把一章标成已读；返回是否真的产生了变化（没变化就不用去刷目录） */
export function markRead(path: string): boolean {
  const paths = readPaths()
  if (paths.includes(path)) return false
  writeRead([...paths, path])
  return true
}

/**
 * 章节读完：清掉阅读位置（下次从头读），并记进已读集合。
 * 第一次读完时通知监听者（shelf 借此即时刷新目录小点）。
 */
function finish(path: string): void {
  clear(path)
  if (markRead(path)) emitRead(path)
}

/**
 * 老版本只存了 novel-progress，升级后要把「已有进度」并进已读集合，
 * 否则老读者会突然发现目录小点全没了。整个生命周期只跑一次。
 */
function migrateLegacyRead() {
  try {
    if (localStorage.getItem('novel-read-migrated') === '1') return
    for (const entry of read()) {
      if (entry.y > 0) markRead(entry.path)
    }
    localStorage.setItem('novel-read-migrated', '1')
  } catch {
    // 迁移失败不影响使用
  }
}

/** 正文页才有这个类名（由 config.mts 的 transformPageData 注入） */
function isReadingPage() {
  return Boolean(document.querySelector('.Layout.novel-chapter'))
}

function scrollTop() {
  return window.scrollY || document.documentElement.scrollTop || 0
}

export function installReadingProgress(router: VitePressRouter) {
  /**
   * 所有逻辑都包一层：这是全局增强，任何一种意外都不该让整站白屏。
   */
  const safe =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      try {
        fn(...args)
      } catch (error) {
        console.error('[novel] 阅读进度出错：', error)
      }
    }

  // 老读者的旧数据先并进已读集合，再开始正常逻辑
  safe(migrateLegacyRead)()

  // 首屏时 router.route 还停在默认的 "/"，真正的页面地址看 location 才准
  let currentPath = currentRoutePath(router) || normalizePath(window.location.pathname)
  let pending: Entry | null = null
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let skipNext = false
  let lastRestore = { path: '', at: 0 }

  /** 记下「此刻这一页滚到哪儿了」，先不落盘 */
  const capture = () => {
    if (!isReadingPage()) return
    pending = { path: currentPath, y: scrollTop() }
  }

  /**
   * 是否已经滚到「读完了」那条线。
   * 判定只有这一处，flush 与滚动即时标记都用它，避免两边标准跑偏。
   */
  const reachedEnd = () => {
    if (!isReadingPage()) return false
    const bottom = document.documentElement.scrollHeight - window.innerHeight
    return bottom > 0 && scrollTop() >= bottom - FINISHED_GAP
  }

  /** 把 capture 记下的位置写进 localStorage */
  const flush = () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!pending) return
    const { path, y } = pending
    pending = null

    const bottom = document.documentElement.scrollHeight - window.innerHeight
    if (bottom > 0 && y >= bottom - FINISHED_GAP) {
      // 这一章读到底了：位置清掉（下次从开头读），同时记进已读
      finish(path)
    } else if (y > 0) {
      save(path, y)
    }
  }

  /** 读到页尾就即时标记：读者停在章末不动时，目录里也该立刻出点 */
  const markIfFinished = () => {
    if (reachedEnd()) finish(currentPath)
  }

  const onScroll = () => {
    capture()
    markIfFinished()
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(flush, 300)
  }

  window.addEventListener('scroll', safe(onScroll), { passive: true })
  window.addEventListener(
    'beforeunload',
    safe(() => {
      capture()
      flush()
    })
  )
  document.addEventListener(
    'visibilitychange',
    safe(() => {
      if (document.visibilityState === 'hidden') {
        capture()
        flush()
      }
    })
  )

  // 点「上一章 / 下一章」时，下一页不要恢复旧位置
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.pager-link')) skipNext = true
    },
    true
  )

  /** 离开这一页前先把位置存好；如果正停在章末，也要补记「已读」 */
  onNavigationStart(
    safe(() => {
      capture()
      markIfFinished()
      flush()
    })
  )

  const restore = (path: string) => {
    if (lastRestore.path === path && Date.now() - lastRestore.at < 800) return
    const y = readOne(path)
    if (y === null || y < MIN_RESTORE) return
    lastRestore = { path, at: Date.now() }

    let tries = 0
    const attempt = () => {
      // 已经切到别的页面了就别再折腾
      if (currentRoutePath(router) !== path) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      // 新页面的内容（图片、字体）可能还没撑开，撑到目标位置再滚
      if ((isReadingPage() && max >= y - 8) || tries >= MAX_TRIES) {
        window.scrollTo({ top: Math.min(y, Math.max(max, 0)), behavior: 'auto' })
        return
      }
      tries++
      setTimeout(attempt, RETRY_DELAY)
    }

    // 等 Vue 把新页面挂上去、VitePress 自己那次「滚到顶」跑完
    requestAnimationFrame(() => setTimeout(attempt, 60))
  }

  onNavigationEnd(
    safe((to: string) => {
      currentPath = normalizePath(to)
      const skip = skipNext || Boolean(router.route?.hash)
      skipNext = false
      if (!skip) restore(currentPath)
    })
  )

  // 首屏（刷新 / 直接输网址进来）时上面那个钩子还没轮到，补一次
  setTimeout(safe(() => restore(currentRoutePath(router) || normalizePath(window.location.pathname))), 160)
}
