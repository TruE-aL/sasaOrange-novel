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
 * 「已读」由读者自己的滚动来判定（滚到本章 90% 即算），全程不看切页那一刻
 * 的滚动值——VitePress 路由会在切页瞬间自己滚一下，那个值不可信。详见
 * 下方 onNavigationStart / frozen 的说明。
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

/**
 * 「最近打开过哪一章」的存储键，给书架卡片的「继续阅读」用。
 *
 * 为什么和 novel-read 分开：两者的语义天生不同——
 *   · 目录小圆点要的是「读完过」→ 严格，读到 90% 才算（novel-read）
 *   · 书卡继续阅读要的是「上次读到哪」→ 宽松，打开过就算数（novel-last）
 *
 * 早先图省事，让「继续阅读」也从 novel-read 反推，结果读者在某章读到一半
 * 就离开时那一章不进已读集合，卡片只能指向上一个「读完过」的章——
 * 表现就是「明明刚才在读第 4 章，回书架却还显示继续读第 1 章」。
 * 拆成两份后各按各的语义走，互不干扰。
 *
 * 每部作品只留一条（值为章节路径），因为书卡只需要「任一本书最近在读的那一章」。
 * 结构是 { [novelPrefix]: path }：
 *   {"chixucunzai": "/novels/chixucunzai/04-第二章"}
 * 用「作品路径前缀」当键，同一本书反复读只覆盖自己那条，不会越写越长。
 */
export const LAST_STORAGE_KEY = 'novel-last'

/** 从章节路径取所属作品的路径前缀（/novels/<slug>/xx-章 → /novels/<slug>） */
export function novelPrefixOf(path: string): string {
  const match = path.match(/^(.*\/novels\/[^/]+)\//)
  return match ? match[1] : ''
}

/** 记下「最近打开的这一章」，供书架卡片的「继续阅读」用 */
export function markLastRead(path: string): void {
  const prefix = novelPrefixOf(path)
  if (!prefix) return
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_STORAGE_KEY) || '{}')
    const map = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    map[prefix] = path
    localStorage.setItem(LAST_STORAGE_KEY, JSON.stringify(map))
  } catch {
    // 隐私模式写不了就算了，继续阅读退化成「开始阅读」
  }
}

/** 读出每本书「最近打开的那一章」（键是作品路径前缀） */
export function lastReadMap(): Record<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LAST_STORAGE_KEY) || '{}')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, string> = {}
    for (const [prefix, path] of Object.entries(raw)) {
      if (typeof path === 'string' && path) out[prefix] = path
    }
    return out
  } catch {
    return {}
  }
}

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
 *   · novel-last            —— 书架卡片的「继续阅读」，一并还原成「开始阅读」
 *   · novel-progress        —— 老版本残留的「阅读位置」，顺手清干净
 *   · novel-read-migrated   —— 老数据迁移标记，一并清掉
 *
 * 清完通知监听者（shelf 借此立刻把目录小点抹掉，不用等切页）。
 */
export function clearAllReadData(): void {
  try {
    localStorage.removeItem(READ_STORAGE_KEY)
    localStorage.removeItem(LAST_STORAGE_KEY)
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
   * 切页已经开始了：这之后到达的 scroll 事件都当成「路由自己在动」，一律忽略。
   *
   * 为什么需要它：VitePress 在切页瞬间会自己滚一下（实测停在顶部点「下一章」，
   * scrollY 在半帧内冲到 scrollHeight），而 scroll 事件是异步派发的——它在钩子
   * 之后才到达（实测约 +29ms）。若不挡住，onScroll 里的实时判定会把这个假位置
   * 当成「读者读到页尾」，把刚翻开没读的一章误标成已读。
   *
   * ✅ 必须在 onNavigationStart 里置位：它先于那个 scroll 事件执行。
   *    （注意这里不能顺手 capture()，那一刻 scrollY 已被污染。）
   */
  let frozen = false

  /**
   * 某个滚动位置是不是已经越过「读完了」那条线（本章 90%）。
   *
   * 收成纯函数（位置由调用方传进来），因为两种场合该用的位置不一样：
   *   · 读者还在这一页滚 → 传实时 scrollTop()，那是真的滚动
   *   · 正要离开这一页   → 传切页前记下的 pendingY，实时值此刻已不可信
   *     （VitePress 会在切页瞬间自己滚一下，见 frozen 那段说明）
   *
   * 判定标准只此一处，标记与取消共用，省得两边口径跑偏。
   */
  const reachedEndAt = (y: number) => {
    if (!isReadingPage()) return false
    const max = document.documentElement.scrollHeight - window.innerHeight
    // 页面短到没有可滚动空间时，视为"一眼看完"→ 不算读完（否则一进来就自动已读）
    return max > 0 && y / max >= FINISHED_RATIO
  }

  /** 读到页尾就即时标记：读者停在章末不动时，目录里也该立刻出点 */
  const markIfFinished = () => {
    if (reachedEndAt(scrollTop())) finish(currentPath)
  }

  const onScroll = () => {
    // 切页途中路由自己滚出来的事件不算数，别让它污染 pendingY
    if (frozen) return
    capture()
    markIfFinished()
    // 防抖：滚完停一会儿再确认一次，避免最后一帧刚好越过判定线却漏掉
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (!frozen) markIfFinished()
    }, 300)
  }

  window.addEventListener('scroll', safe(onScroll), { passive: true })

  /**
   * 刷新 / 关标签页：此时路由不会自己滚，实时位置是可信的，
   * 所以直接读实时值记一次（「读到页尾就走了」也该算数）。
   * 若正处在切页途中（frozen），就跳过一次，免得把假滚动当成读完。
   */
  const markOnLeave = () => {
    if (frozen) return
    capture()
    markIfFinished()
  }

  window.addEventListener('beforeunload', safe(markOnLeave))
  document.addEventListener(
    'visibilitychange',
    safe(() => {
      if (document.visibilityState === 'hidden') markOnLeave()
    })
  )

  /**
   * 离开这一章（切到别的页）：
   *  · 中途离开        → 若这章本是已读，取消小点（这次没读到底）
   *  · 停在章末        → 不需要在这里补记，见下
   *  · 刷新 / 关标签页  → 走的是 beforeunload / visibilitychange，不经过这里，
   *                     所以不算「重新读了一遍」，已读状态不动
   *
   * 为什么这里**只取消、不补记**：
   * 「读到底」这件事在 onScroll 里已经判定过了——读者滚到 90% 的那一刻就会
   * 实时打上，根本轮不到离开时才补。而离开这一刻的实时 scrollY 是不可信的：
   * VitePress 的路由在切页瞬间会自己滚一下（实测停在顶部点「下一章」，
   * scrollY 在半帧内冲到 scrollHeight），若在此处读实时值，等于把每一章
   * 都判成「读到页尾」，刚翻开没读的章节会被误标成已读。
   * 所以这里只用切页前记下的 pendingY 做「要不要收回小点」的判断。
   */
  onNavigationStart(
    safe((to: string) => {
      // 先上闸：挡住紧随其后、由路由自己滚动触发的那批 scroll 事件
      frozen = true

      const leaving = normalizePath(to) !== currentPath
      // 停在顶部没动过（pendingY == 0）就不管，避免刚进来没滚就被改状态
      if (leaving && pendingY > 0 && !reachedEndAt(pendingY)) {
        reopen(currentPath)
      }
      pendingY = 0
    })
  )

  onNavigationEnd(
    safe((to: string) => {
      currentPath = normalizePath(to)
      pendingY = 0
      frozen = false
      // 不再恢复滚动位置：每次进章节都从文章头开始

      // 记下「最近打开过这一章」，给书架卡片的「继续阅读」用。
      // 和已读（novel-read）分开：这个宽松，进来就算；已读严格，读到 90% 才算。
      // 只在正文页记——切到书架/首页时 isReadingPage() 为假，不会把目录页记进去。
      if (isReadingPage()) markLastRead(currentPath)
    })
  )
}
