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
const DURATION = 320
const EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
/** 上移距离：太小会「感觉不到」，太大会晃眼 */
const OFFSET = 16

/** 想在被系统标记为「减弱动效」的设备上强制开启：控制台执行
    localStorage.setItem('novel-motion', 'force') 然后刷新 */
const FORCE_KEY = 'novel-motion'

/** 开发模式才打诊断日志；写成防御式读取，模块在 Node 里单独跑也不会炸 */
const DEV = (() => {
  try {
    return Boolean(import.meta.env?.DEV)
  } catch {
    return false
  }
})()

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

  // 读者如果在系统里关掉了动效，就不播动画；可以用 localStorage 强制打开
  let reduced = false
  let forced = false
  try {
    reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    forced = localStorage.getItem(FORCE_KEY) === 'force'
  } catch {
    // matchMedia / localStorage 不可用时按默认处理，下面还有 typeof 检查兜底
  }
  const enabled = forced || !reduced

  if (DEV && reduced && !forced) {
    console.info(
      '[novel] 系统开启了「减弱动效」，页面过渡已跳过。' +
        `想强制开启：localStorage.setItem('${FORCE_KEY}', 'force') 后刷新`
    )
  }

  let firstNavigation = true

  router.afterEach(
    safe(() => {
      // 首次进入（刷新 / 直接输网址）不播：那时内容已经在屏幕上了，闪一下反而怪
      if (firstNavigation) {
        firstNavigation = false
        if (DEV) console.info('[novel] 首次进入不播过渡，之后切换章节会播')
        return
      }
      if (!enabled || typeof Element === 'undefined') return

      // 等 Vue 把新页面写进 DOM（等两帧更稳：第一帧 afterEach、第二帧渲染完成）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = contentTarget()
          if (!target || typeof target.animate !== 'function') return
          target.animate(
            [
              { opacity: 0, transform: `translateY(${OFFSET}px)` },
              { opacity: 1, transform: 'none' }
            ],
            { duration: DURATION, easing: EASING }
          )
          if (DEV) {
            console.info(`[novel] 页面过渡：${DURATION}ms，上移 ${OFFSET}px`)
          }
        })
      })
    })
  )
}
