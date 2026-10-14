import { defineComponent, h, onMounted, onUnmounted, ref } from 'vue'
import { progressPercent } from './readingProgress'

/**
 * 顶部阅读进度条（借鉴 sakurairo 的 `.iro-scroll-percent`）。
 * 只在正文页显示：页面上还有多少没读，一眼能看到。
 */

export default defineComponent({
  name: 'ReadingProgress',
  setup() {
    const percent = ref(0)
    let frame = 0

    const measure = () => {
      frame = 0
      const doc = document.documentElement
      percent.value = progressPercent(
        window.scrollY || doc.scrollTop || 0,
        doc.scrollHeight,
        window.innerHeight
      )
    }

    // 用 rAF 节流，滚动时不做多余计算
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }

    onMounted(() => {
      measure()
      window.addEventListener('scroll', onScroll, { passive: true })
      window.addEventListener('resize', onScroll, { passive: true })
    })

    onUnmounted(() => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    })

    return () =>
      h('div', {
        class: 'novel-progress',
        style: { width: `${percent.value}%` },
        'aria-hidden': 'true'
      })
  }
})
