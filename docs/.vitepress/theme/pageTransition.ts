import type { Router } from 'vue-router'

/**
 * 页面（章节）切换时的入场动画。
 *
 * 为什么用 Web Animations API 而不是 <Transition>：VitePress 的页面内容是它自己
 * 渲染的，从外面拿不到那个插槽；套一层 Transition 得改它的组件结构，风险大。
 * 这里只在路由切换完成后给内容区播一段动画，不碰 VitePress 的内部结构。
 *
 * 只做入场（淡入 + 轻微上移）：退场动画需要在切换前阻塞 DOM 替换，
 * 会拖慢导航手感，阅读类站点一般不做。
 */
const DURATION = 260
const EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

/** 动的是正文内容，不动侧边栏和大纲，视觉上更稳 */
function contentTarget(): Element | null {
  return (
    document.querySelector('.VPHome') ??
    document.querySelector('.VPDoc .vp-doc') ??
    document.querySelector('#VPContent')
  )
}

export function installPageTransition(router: Router) {
  const safe = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    try {
      fn(...args)
    } catch (error) {
      console.error('[novel] 页面过渡出错：', error)
    }
  }

  // 读者如果在系统里关掉了动效，就不播动画
  let enabled = true
  try {
    enabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    // matchMedia 不可用就按“开”处理，下面还有 typeof 检查兜底
  }

  let firstNavigation = true

  router.afterEach(
    safe(() => {
      // 首次进入（刷新 / 直接输网址）不播：那时内容已经在屏幕上了，闪一下反而怪
      if (firstNavigation) {
        firstNavigation = false
        return
      }
      if (!enabled || typeof Element === 'undefined') return

      // 等 Vue 把新页面写进 DOM
      requestAnimationFrame(() => {
        const target = contentTarget()
        if (!target || typeof target.animate !== 'function') return
        target.animate(
          [
            { opacity: 0, transform: 'translateY(8px)' },
            { opacity: 1, transform: 'none' }
          ],
          { duration: DURATION, easing: EASING }
        )
      })
    })
  )
}
