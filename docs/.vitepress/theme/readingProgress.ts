import {
  currentRoutePath,
  normalizePath,
  onNavigationEnd,
  onNavigationStart,
  type VitePressRouter
} from './navigation'

/**
 * 阅读记录：只记「读到过哪些章节」，不记滚动位置。
 *
 * 早先还会把每章滚到哪儿存进 localStorage，下次回来接着读。后来去掉了：
 *   · 从书架点「开始阅读」进来，正文从中间开始，反而不像"开始"；
 *   · 内容有图片 / 字体，恢复位置要反复重试，偶尔会落到奇怪的地方。
 * 现在**只存已读章节**，任何一次进入都从文章头开始读。
 *
 * 切页时机借 theme/navigation.ts 的统一钩子（VitePress 2 自带路由，没有 vue-router 的 beforeEach）。
 */

/**
 * 已读章节的存储键。
 *
 * 语义是「读到过尾」：读到底就记下来（目录里点一个小圆点），
 * 中途离开不算数。和「读到哪儿了」是两件事，所以只留这一份存储。
 */
export const READ_STORAGE_KEY = 'novel-read'

/** 顶部进度条用的百分比 0–100。（纯函数，放在这里是因为它和阅读进度同属一件事） */
export function progressPercent(scrollTop: number, scrollHeight: number, innerHeight: number) {
  const max = scrollHeight - innerHeight
  if (!(max > 0)) return 0
  return Math.min(100, Math.max(0, Math.round((scrollTop / max) * 100)))
}

/**
 * 「目录小点需要刷新」的回调表（已读 / 已读被取消 都走这里）。
 *
 * shelf.ts 需要在这些时刻即时把目录小点刷出来（不等切页），
 * 但它已经 import 了本模块，这里再 import 回去就成环了。
 * 所以反过来：由 shelf 注册回调，本模块在状态变化时调用，方向单向。
 */
type ReadListener = () => void
const readListeners: ReadListener[] = []

export function onChapterRead(listener: ReadListener) {
  readListeners.push(listener)
}

function emitReadChange() {
  for (const listener of readListeners) {
    try {
      listener()
    } catch (error) {
      console.error('[novel] 已读回调出错：', error)
    }
  }
}

/**
 * 读到这一章的多大比例就算「读完」。
 *
 * 不用「距页尾 40px」那种固定像素差，因为它跟章节长短无关：
 * 长章节末尾留白多，可能还差好几屏就觉得"快到了"；短章节反而 40px 占比很大。
 * 改成比例后，长短章节一视同仁。数值取 0.9（读到 90% 即算）。
 * （思路参考 Teek 的 back-top 进度条：scrollY / (scrollHeight - innerHeight)）
 */
const FINISHED_RATIO = 0.9
/** 最多记多少章，超出就丢掉最早的 */
const MAX_ENTRIES = 120

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

/**
 * 一键清空所有阅读记录。
 *
 *   · novel-read            —— 目录里的已读小点擦掉
 *   · novel-progress        —— 老版本残留的「阅读位置」，顺手清干净
 *   · novel-read-migrated   —— 老数据迁移标记，一并清掉
 *
 * 清完通知监听者（shelf 借此立刻把目录小点抹掉，不用等切页）。
 */
export function clearAllReadData(): void {
  try {
    localStorage.removeItem(READ_STORAGE_KEY)
    localStorage.removeItem('novel-progress')
    localStorage.removeItem('novel-read-migrated')
  } catch {
    // 隐私模式写不了就算了
  }
  emitReadChange()
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

/** 取消一章的已读标记；返回是否真的产生了变化 */
function unmarkRead(path: string): boolean {
  const paths = readPaths()
  if (!paths.includes(path)) return false
  writeRead(paths.filter((item) => item !== path))
  return true
}

/**
 * 章节读完：记进已读集合。
 * 第一次读完时通知监听者（shelf 借此即时刷新目录小点）。
 */
function finish(path: string): void {
  if (markRead(path)) emitReadChange()
}

/**
 * 重新打开一个已读章节、却没读到底就离开：取消它的已读标记。
 *
 * 语义上说得通——「已读」表示的是「这一章读到过尾」，
 * 既然这次重读没到结尾，那这个小点就该收回去。
 *
 * 返回是否真的取消了（取消了才需要刷目录）。
 */
function reopen(path: string): boolean {
  if (!unmarkRead(path)) return false
  emitReadChange()
  return true
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
  let pendingY = 0
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  /** 记下「此刻这一页滚到哪儿了」，供离开时判断是否停在章末 */
  const capture = () => {
    if (!isReadingPage()) return
    pendingY = scrollTop()
  }

  /**
   * 是否已经滚到「读完了」那条线（读到本章 90%）。
   * 判定只有这一处，离开时的补记与滚动即时标记都用它，避免两边标准跑偏。
   */
  const reachedEnd = () => {
    if (!isReadingPage()) return false
    const max = document.documentElement.scrollHeight - window.innerHeight
    // 页面短到没有可滚动空间时，视为"一眼看完"→ 不算读完（否则一进来就自动已读）
    return max > 0 && scrollTop() / max >= FINISHED_RATIO
  }

  /** 读到页尾就即时标记：读者停在章末不动时，目录里也该立刻出点 */
  const markIfFinished = () => {
    if (reachedEnd()) finish(currentPath)
  }

  const onScroll = () => {
    capture()
    markIfFinished()
    // 防抖：滚完停一会儿再确认一次，避免最后一帧刚好越过判定线却漏掉
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      markIfFinished()
    }, 300)
  }

  window.addEventListener('scroll', safe(onScroll), { passive: true })
  window.addEventListener(
    'beforeunload',
    safe(() => {
      capture()
      markIfFinished()
    })
  )
  document.addEventListener(
    'visibilitychange',
    safe(() => {
      if (document.visibilityState === 'hidden') {
        capture()
        markIfFinished()
      }
    })
  )

  /**
   * 离开这一章（切到别的页）：
   *  · 停在章末        → 补记「已读」
   *  · 中途离开        → 若这章本是已读，取消小点（这次没读到底）
   *  · 刷新 / 关标签页  → 走的是 beforeunload / visibilitychange，不经过这里，
   *                     所以不算「重新读了一遍」，已读状态不动
   */
  onNavigationStart(
    safe((to: string) => {
      capture()
      markIfFinished()

      const leaving = normalizePath(to) !== currentPath
      // 只在「真的读了一点」时才收回小点，避免刚进来没滚就被取消
      if (leaving && !reachedEnd() && pendingY > 0) {
        reopen(currentPath)
      }
      pendingY = 0
    })
  )

  onNavigationEnd(
    safe((to: string) => {
      currentPath = normalizePath(to)
      pendingY = 0
      // 不再恢复滚动位置：每次进章节都从文章头开始
    })
  )
}
