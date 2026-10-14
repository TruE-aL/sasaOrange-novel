import type { Router } from 'vue-router'

/**
 * 阅读进度记忆：把每章的滚动位置存进 localStorage，下次回到这一章接着读。
 *
 * 几条规则（都是为了避免「奇怪地回到中间」）：
 * - 只记正文页：书架首页、作品许可页这类不记
 * - 点「上一章 / 下一章」时不恢复：那种情况读者通常想看新章节的开头
 * - 带 #锚点 的链接不恢复：交给 VitePress 自己定位到锚点
 * - 已经滚到页尾（读完了）就清掉记录，下次从开头开始
 */
export const PROGRESS_STORAGE_KEY = 'novel-progress'

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

export function installReadingProgress(router: Router) {
  let currentPath = router.currentRoute.value.path
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

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('beforeunload', () => {
    capture()
    flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      capture()
      flush()
    }
  })

  // 点「上一章 / 下一章」时，下一页不要恢复旧位置
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target as HTMLElement | null
      if (target?.closest?.('.pager-link')) skipNext = true
    },
    true
  )

  /** 离开这一页前先把位置存好（SPA 跳转不会触发 beforeunload） */
  router.beforeEach(() => {
    capture()
    flush()
  })

  const restore = (path: string) => {
    if (lastRestore.path === path && Date.now() - lastRestore.at < 800) return
    const y = readOne(path)
    if (y === null || y < MIN_RESTORE) return
    lastRestore = { path, at: Date.now() }

    let tries = 0
    const attempt = () => {
      if (!isReadingPage() || router.currentRoute.value.path !== path) return
      const max = document.documentElement.scrollHeight - window.innerHeight
      if (max >= y - 8 || tries >= MAX_TRIES) {
        window.scrollTo({ top: Math.min(y, Math.max(max, 0)), behavior: 'auto' })
        return
      }
      tries++
      setTimeout(attempt, RETRY_DELAY)
    }

    requestAnimationFrame(() => setTimeout(attempt, 60))
  }

  router.afterEach((to) => {
    currentPath = to.path
    const skip = skipNext || Boolean(to.hash)
    skipNext = false
    if (!skip) restore(to.path)
  })

  // 首屏（刷新 / 直接输网址进来）时 afterEach 不一定触发，补一次
  setTimeout(() => restore(router.currentRoute.value.path), 120)
}
