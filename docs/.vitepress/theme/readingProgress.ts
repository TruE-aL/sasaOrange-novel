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

/** 顶部进度条用的百分比 0–100。（纯函数，放在这里是因为它和阅读进度同属一件事） */
export function progressPercent(scrollTop: number, scrollHeight: number, innerHeight: number) {
  const max = scrollHeight - innerHeight
  if (!(max > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)))
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
      // 这一章读到底了，下次从开头读
      clear(path)
    } else if (y > 0) {
      save(path, y)
    }
  }

  const onScroll = () => {
    capture()
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

  /** 离开这一页前先把位置存好 */
  onNavigationStart(
    safe(() => {
      capture()
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
