import { onNavigationEnd, normalizePath } from './navigation'
import {
  readPaths as readChapterPaths,
  lastReadMap,
  novelPrefixOf,
  onChapterRead
} from './readingProgress'

/**
 * 书架上的「继续阅读」：
 * 首页的 <head> 里带了一份章节清单（window.__NOVEL_SHELF__，见 config.mts），
 * 这里读「最近打开过的章节」，于是书卡上的「开始阅读」就能变成
 * 「继续阅读 · 第5章」，点了直接跳过去。
 *
 * 注意：只记「读到哪一章」，不记章内位置——跳过去也是从那一章开头读。
 *
 * 数据用 novel-last（打开过就算），不是 novel-read（读到底才算）：
 * 若拿已读集合反推，读者在某章读到一半就走时那一章不在集合里，
 * 卡片会指向上一个「读完过」的章——表现就是"明明刚在读第4章，却显示第1章"。
 *
 * 顺手把侧边栏目录里读过的章节标一下（一个小圆点，用的是 novel-read）。
 * 全是渐进增强：拿不到数据就什么都不做，原来的「开始阅读」照常可用。
 */

type ShelfChapter = { href: string; label: string; title: string }
type ShelfNovel = { slug: string; start: string; title: string; chapters: ShelfChapter[] }

function shelfNovels(): ShelfNovel[] {
  try {
    const data = (window as unknown as { __NOVEL_SHELF__?: ShelfNovel[] }).__NOVEL_SHELF__
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 首页书卡：换成「继续阅读 · 第N章」 */
function applyContinueReading(lastMap: Record<string, string>) {
  const novels = shelfNovels()
  if (novels.length === 0) return

  // 先把页面上的卡片按「规范化后的 href」收进表里，避免中文字符串选择器的坑
  const cards = new Map<string, HTMLAnchorElement>()
  for (const card of document.querySelectorAll<HTMLAnchorElement>('.shelf-card')) {
    const href = card.getAttribute('href')
    if (href) cards.set(normalizePath(href), card)
  }

  for (const novel of novels) {
    // novel-last 以「作品路径前缀」为键（/novels/<slug>），直接取这本书最近打开的那一章
    const last = lastMap[novelPrefixOf(novel.start)]
    if (!last) continue

    const chapter = novel.chapters.find((c) => normalizePath(c.href) === normalizePath(last))
    const card = cards.get(normalizePath(novel.start))
    if (!chapter || !card) continue

    card.setAttribute('href', chapter.href)
    card.classList.add('is-continuing')
    const text = card.querySelector('.shelf-more-text')
    if (text) {
      const label = chapter.label ? `${chapter.label}　` : ''
      text.textContent = `继续阅读 · ${label}${chapter.title}`
    }
  }
}

/** 侧边栏目录：给读过的章节加个标记 */
function markReadChapters(readSet: Set<string>) {
  for (const link of document.querySelectorAll<HTMLAnchorElement>('.VPSidebar .VPSidebarItem.level-1 .link')) {
    const item = link.closest('.VPSidebarItem')
    const href = link.getAttribute('href')
    if (!item || !href) continue
    item.classList.toggle('is-read', readSet.has(normalizePath(href)))
  }
}

/**
 * 刷新目录里的「已读」小点。
 *
 * 已读来自 novel-read 这份独立存储（读到底才算），不再从阅读位置反推——
 * 那两者语义相反，反推会导致「章末点下一章」时小点丢失。
 */
function refreshReadMarks() {
  try {
    markReadChapters(new Set(readChapterPaths().map((path) => normalizePath(path))))
  } catch (error) {
    console.error('[novel] 已读标记失败：', error)
  }
}

/** 把「继续阅读 / 读过的章节」这些标记一次性刷出来 */
function refresh() {
  try {
    applyContinueReading(lastReadMap())
  } catch (error) {
    console.error('[novel] 书架增强失败：', error)
  }
  refreshReadMarks()
}

export function installShelf() {
  // 卡片与目录是随页面渲染的，路由切换后才会出现，所以每次切完页都重刷一遍
  onNavigationEnd(() => {
    // 等 Vue 把新页面挂上去
    setTimeout(refresh, 60)
  })
  // 首屏（刷新 / 直接输网址）补一次
  setTimeout(refresh, 160)

  // 读到章末 / 已读被取消的那一刻，立刻刷新目录小点，不用等切页
  onChapterRead(() => refreshReadMarks())
}
