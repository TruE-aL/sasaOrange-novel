import { defineComponent, h, ref, computed, onMounted, onUnmounted } from 'vue'
import { useData } from 'vitepress'

/**
 * 和 config.mts 里那段防闪烁脚本共用的键名。
 * 这里只存「目录是否收起」这一个状态，所以单独用一个键，
 * 不动 ReaderSettings 那个（那边是字号 / 行距 / 字体 / 版心）。
 */
export const SIDEBAR_STORAGE_KEY = 'novel-sidebar-collapsed'

/** Teek 那枚「自适应宽度」图标：上下两条横线夹一个左右箭头 */
const ICON = `<svg viewBox="0 0 48 48" width="1.15em" height="1.15em" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="4"><path d="M6 7h36M8 24h32"/><path stroke-linejoin="round" d="M13.99 30L8 24.005L14 18m20.01 0L40 23.995L34 30"/><path d="M6 41h36"/></g></svg>`

/**
 * 章节目录折叠按钮（仅桌面端）。
 *
 * 做法参考 vitepress-theme-teek 的 sidebar-trigger：
 *  1. 给 <html> 加 .novel-sidebar-collapsed，CSS 把侧边栏宽度过渡到 0
 *     （用 width:0 而不是 display:none，这样才有平滑动画）
 *  2. 按钮 fixed 定位，left 值跟着折叠状态切换，所以收起后按钮会自己滑到左边
 *  3. 过渡 class 在挂载后才加，避免「首页 → 文章页」切换时动画跟着播一遍
 *
 * 只在有侧边栏的章节页显示；手机上（<960px）这个按钮不渲染。
 */
export default defineComponent({
  name: 'SidebarToggle',
  setup() {
    const { frontmatter } = useData()
    const collapsed = ref(false)

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

      // 记住上次的选择
      try {
        collapsed.value = localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
      } catch {
        collapsed.value = false
      }
      sync()

      // 等首帧渲染完再加过渡：否则首次进入文章页会看到侧边栏「收起」的动画
      requestAnimationFrame(() => {
        document.documentElement.classList.add('novel-sidebar-animated')
      })
    })

    onUnmounted(() => {
      mql?.removeEventListener('change', syncDesktop)
    })

    const toggle = () => {
      collapsed.value = !collapsed.value
      sync()
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed.value ? '1' : '0')
      } catch {
        // 隐私模式写不了也没关系，只是记不住
      }
    }

    return () => {
      if (!visible.value || !isDesktop.value) return null
      const label = collapsed.value ? '展开章节目录' : '收起章节目录'
      return h(
        'button',
        {
          type: 'button',
          class: ['novel-sidebar-toggle', { 'is-collapsed': collapsed.value }],
          title: label,
          'aria-label': label,
          'aria-expanded': String(!collapsed.value),
          innerHTML: ICON,
          onClick: toggle
        }
      )
    }
  }
})
