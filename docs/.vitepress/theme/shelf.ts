import { onNavigationEnd, normalizePath } from './navigation'
import { PROGRESS_STORAGE_KEY, readPaths as readChapterPaths, onChapterRead } from './readingProgress'

/**
 * 书架上的「继续阅读」：
 * 首页的 <head> 里带了一份章节清单（window.__NOVEL_SHELF__，见 config.mts），
 * 这里读 localStorage 里的阅读进度，找出每本书最近读到的那一章，
 * 于是书卡上的「开始阅读」就能变成「继续阅读 · 第5章」，点了直接跳过去。
 *
 * 顺手把侧边栏目录里读过的章节标一下（一个小圆点）。
 * 全是渐进增强：拿不到数据就什么都不做，原来的「开始阅读」照常可用。
 */

type ShelfChapter = { href: string; label: string; title: string }
type ShelfNovel = { slug: string; start: string; title: string; chapters: ShelfChapter[] }

/** 读阅读进度：数组按「最近读过的排在后面」排序 */
function progressPaths(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_STORAGE_KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw
      .filter((item) => item && typeof item.path === 'string' && Number(item.y) > 0)
      .map((item) => normalizePath(item.path))
  } catch {
    return []
  }
}

function shelfNovels(): ShelfNovel[] {
  try {
    const data = (window as unknown as { __NOVEL_SHELF__?: ShelfNovel[] }).__NOVEL_SHELF__
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 首页书卡：换成「继续阅读 · 第N章」 */
function applyContinueReading(paths: string[]) {
  const novels = shelfNovels()
  if (novels.length === 0) return

  // 先把页面上的卡片按「规范化后的 href」收进表里，避免中文字符串选择器的坑
  const cards = new Map<string, HTMLAnchorElement>()
  for (const card of document.querySelectorAll<HTMLAnchorElement>('.shelf-card')) {
    const href = card.getAttribute('href')
    if (href) cards.set(normalizePath(href), card)
  }

  for (const novel of novels) {
    // 进度数组按时间递增，最后一个匹配到这本书的就是「最近读的那一章」
    const recent = paths.filter((path) => novel.chapters.some((c) => normalizePath(c.href) === path))
    const target = recent[recent.length - 1]
    if (!target) continue

    const chapter = novel.chapters.find((c) => normalizePath(c.href) === target)
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
    applyContinueReading(progressPaths())
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
