import { defineComponent, h, ref, computed, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'
import { clearAllReadData } from './readingProgress'

/** 清空阅读记录：Fluent 的 history-dismiss（带叉的小钟） */
const CLEAR_ICON = `<svg viewBox="0 0 20 20" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M10 4a6 6 0 0 1 5.946 5.192c.558.152 1.08.389 1.553.697A7.5 7.5 0 0 0 5 4.409V3.25a.75.75 0 0 0-1.5 0v3c0 .414.336.75.75.75h3a.75.75 0 0 0 0-1.5H6.031A5.98 5.98 0 0 1 10 4m.257 7a5.5 5.5 0 0 1 1.949-1.5H10.5V6.25a.75.75 0 0 0-1.5 0v4c0 .414.336.75.75.75zm-.368 6.5a5.5 5.5 0 0 1-.697-1.554a6 6 0 0 1-5.188-6.169a.75.75 0 1 0-1.499-.054A7.5 7.5 0 0 0 9.89 17.5m9.111-3a4.5 4.5 0 1 1-9 0a4.5 4.5 0 0 1 9 0m-2.646-1.146a.5.5 0 0 0-.708-.708L14.5 13.793l-1.146-1.147a.5.5 0 0 0-.708.708l1.147 1.146l-1.147 1.146a.5.5 0 0 0 .708.708l1.146-1.147l1.146 1.147a.5.5 0 0 0 .708-.708L15.207 14.5z"/></svg>`

/** 清空成功后的对勾（Fluent checkmark），短暂替一下图标当反馈 */
const DONE_ICON = `<svg viewBox="0 0 20 20" width="1em" height="1em" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7.5 13.5a.75.75 0 0 1-.53-.22l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47l7.47-7.47a.75.75 0 0 1 1.06 1.06l-8 8a.75.75 0 0 1-.53.22"/></svg>`

/**
 * 手机端抽屉里的「重置阅读进度」。
 *
 * 桌面端的那枚清空按钮在悬浮工具条上（SidebarToggle），可手机上没有那条工具条
 * ——抽屉合着的时候根本够不着，所以这里单独给抽屉放一枚，挂在
 * VPSidebar 的 `sidebar-nav-after` 插槽里（目录列表的下方）。
 *
 * 与桌面端共用 readingProgress 的 clearAllReadData()，行为完全一致：
 * 清掉已读小点 + 书架上的「继续阅读」，并短暂换成对勾当反馈。
 *
 * 只在手机上渲染（≥960px 交给 SidebarToggle 的悬浮按钮，别重复）；
 * 页面判据同其它组件：frontmatter 的 pageClass 是 novel-chapter。
 */
export default defineComponent({
  name: 'MobileClearHistory',
  setup() {
    const { frontmatter } = useData()
    const cleared = ref(false)
    let timer: ReturnType<typeof setTimeout> | null = null

    // 只有正文页有阅读记录可清
    const visible = computed(() => frontmatter.value.pageClass === 'novel-chapter')

    // 手机端才渲染：桌上那条悬浮工具条已经有这个功能了
    const isMobile = ref(false)
    const mql = typeof window !== 'undefined' ? window.matchMedia('(max-width: 959.98px)') : null
    const syncMobile = (event: MediaQueryListEvent) => (isMobile.value = event.matches)

    onMounted(() => {
      isMobile.value = mql ? mql.matches : false
      mql?.addEventListener('change', syncMobile)
    })

    onUnmounted(() => {
      mql?.removeEventListener('change', syncMobile)
      if (timer) clearTimeout(timer)
    })

    const clear = () => {
      clearAllReadData()
      cleared.value = true
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cleared.value = false
      }, 1200)
    }

    return () => {
      if (!visible.value || !isMobile.value) return null
      return h(
        'button',
        {
          type: 'button',
          class: ['novel-mobile-clear', { 'is-cleared': cleared.value }],
          title: cleared.value ? '已重置' : '重置阅读进度',
          'aria-label': '重置阅读进度',
          onClick: clear
        },
        [
          h('span', {
            class: 'novel-mobile-clear-icon',
            innerHTML: cleared.value ? DONE_ICON : CLEAR_ICON
          }),
          h('span', { class: 'novel-mobile-clear-text' }, cleared.value ? '已重置' : '重置阅读进度')
        ]
      )
    }
  }
})
