import { defineComponent, h, ref, computed, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
import { clearAllReadData } from './readingProgress'
import { onNavigationEnd } from './navigation'

/** Teek 那枚「自适应宽度」图标：上下两条横线夹一个左右箭头 */
const ICON = `<svg viewBox="0 0 48 48" width="1.15em" height="1.15em" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4"><path d="M6 7h36M8 24h32"/><path stroke-linejoin="round" d="M13.99 30L8 24.005L14 18m20.01 0L40 23.995L34 30"/><path d="M6 41h36"/></g></svg>`

/** 清空阅读记录：Fluent 的 history-dismiss（带叉的小钟） */
const CLEAR_ICON = `<svg viewBox="0 0 20 20" width="1.15em" height="1.15em" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M10 4a6 6 0 0 1 5.946 5.192c.558.152 1.08.389 1.553.697A7.5 7.5 0 0 0 5 4.409V3.25a.75.75 0 0 0-1.5 0v3c0 .414.336.75.75.75h3a.75.75 0 0 0 0-1.5H6.031A5.98 5.98 0 0 1 10 4m.257 7a5.5 5.5 0 0 1 1.949-1.5H10.5V6.25a.75.75 0 0 0-1.5 0v4c0 .414.336.75.75.75zm-.368 6.5a5.5 5.5 0 0 1-.697-1.554a6 6 0 0 1-5.188-6.169a.75.75 0 1 0-1.499-.054A7.5 7.5 0 0 0 9.89 17.5m9.111-3a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0m-2.646-1.146a.5.5 0 0 0-.708-.708L14.5 13.793l-1.146-1.147a.5.5 0 0 0-.708.708l1.147 1.146l-1.147 1.146a.5.5 0 0 0 .708.708l1.146-1.147l1.146 1.147a.5.5 0 0 0 .708-.708L15.207 14.5z"/></svg>`

/** 清空成功后的对勾（Fluent checkmark），短暂替一下图标当反馈 */
const DONE_ICON = `<svg viewBox="0 0 20 20" width="1.15em" height="1.15em" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7.5 13.5a.75.75 0 0 1-.53-.22l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47l7.47-7.47a.75.75 0 0 1 1.06 1.06l-8 8a.75.75 0 0 1-.53.22"/></svg>`

/**
 * 章节目录折叠按钮 + 清空阅读记录按钮（仅桌面端）。
 *
 * 折叠按钮做法参考 vitepress-theme-teek 的 sidebar-trigger：
 *  1. 给 <html> 加 .novel-sidebar-collapsed，CSS 把侧边栏宽度过渡到 0
 *     （用 width:0 而不是 display:none，这样才有平滑动画）
 *  2. 工具条 fixed 定位，left 值跟着折叠状态切换，所以收起后按钮会自己滑到左边
 *  3. 过渡 class 在挂载后才加，避免「首页 → 文章页」切换时动画跟着播一遍
 *
 * 目录状态**不记忆**：每次进入页面都从收起态开始。
 *   · 首屏靠 config.mts 的防闪烁脚本无条件加 .novel-sidebar-collapsed；
 *   · 站内切页（章 → 章，或正文 → 首页再回来）由下面的 onNavigationEnd
 *     把 collapsed 复位，所以「读一会儿、手动展开、回主页、再点开始阅读」
 *     进去看到的仍是收起状态。
 *
 * 两个按钮包在同一个 .novel-sidebar-tools 容器里：定位交给容器，
 * 按钮只要跟着容器排在里面就行，不用各自抄一套 media query。
 *
 * 只在有侧边栏的章节页显示；手机上（<960px）整个容器不渲染。
 */
export default defineComponent({
  name: 'SidebarToggle',
  setup() {
    const { frontmatter } = useData()
    // 默认收起，且只活在当前页面里（不写 localStorage）
    const collapsed = ref(true)
    // 清空成功后的短暂反馈：图标换成对勾
    const cleared = ref(false)
    let clearedTimer: ReturnType<typeof setTimeout> | null = null

    // 只有正文页需要；首页书架、许可页没有目录
    const visible = computed(() => frontmatter.value.pageClass === 'novel-chapter')

    // 手机端：VitePress 用抽屉式侧边栏，这个按钮不适用
    const isDesktop = ref(false)
    const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 960px)') : null
    const syncDesktop = (event: MediaQueryListEvent) => (isDesktop.value = event.matches)

    const sync = () => {
      document.documentElement.classList.toggle('novel-sidebar-collapsed', collapsed.value)
    }

    onMounted(() => {
      isDesktop.value = mql ? mql.matches : false
      mql?.addEventListener('change', syncDesktop)
      sync()

      // 等首帧渲染完再加过渡：否则首次进入文章页会看到侧边栏「收起」的动画
      requestAnimationFrame(() => {
        document.documentElement.classList.add('novel-sidebar-animated')
      })

      // 站内切页后重新收起：组件实例会被复用（章 → 章不会重新 mount），
      // 所以不能只在 onMounted 里做一次。
      onNavigationEnd(() => {
        collapsed.value = true
        sync()
      })
    })

    onUnmounted(() => {
      mql?.removeEventListener('change', syncDesktop)
      if (clearedTimer) clearTimeout(clearedTimer)
    })

    const toggle = () => {
      collapsed.value = !collapsed.value
      sync()
    }

    /** 清空所有阅读记录（阅读位置 + 已读小点），并给一下短暂反馈 */
    const clearHistory = () => {
      clearAllReadData()
      cleared.value = true
      if (clearedTimer) clearTimeout(clearedTimer)
      clearedTimer = setTimeout(() => {
        cleared.value = false
      }, 1200)
    }

    return () => {
      if (!visible.value || !isDesktop.value) return null
      const label = collapsed.value ? '展开章节目录' : '收起章节目录'
      return h('div', { class: 'novel-sidebar-tools' }, [
        // 清空阅读记录放前面（左），折叠按钮放后面（右）
        h('button', {
          type: 'button',
          class: ['novel-history-clear', { 'is-cleared': cleared.value }],
          title: cleared.value ? '已清空' : '清空阅读记录',
          'aria-label': '清空阅读记录',
          innerHTML: cleared.value ? DONE_ICON : CLEAR_ICON,
          onClick: clearHistory
        }),
        h('button', {
          type: 'button',
          class: ['novel-sidebar-toggle', { 'is-collapsed': collapsed.value }],
          title: label,
          'aria-label': label,
          'aria-expanded': String(!collapsed.value),
          innerHTML: ICON,
          onClick: toggle
        })
      ])
    }
  }
})
