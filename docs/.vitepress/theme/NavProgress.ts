import { onNavigationEnd, onNavigationStart } from './navigation'

/**
 * 切换页面时顶部的加载条（nprogress 那种）。
 * 借鉴 sakurairo 用的 vitepress-plugin-nprogress，这里不引依赖、自己实现。
 *
 * 一个细节：静态站跳转通常几十毫秒就完成，立刻显示反而像闪一下，
 * 所以延迟 120ms 再出现——跳转够快的话这条根本不会露脸。
 *
 * 时机来自 theme/navigation.ts 的统一钩子（VitePress 2 自带路由，没有 vue-router 的 beforeEach）。
 */

const SHOW_DELAY = 120
const DONE_HOLD = 240

export function installNavProgress() {
  let bar: HTMLElement | null = null
  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const stop = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer) clearTimeout(timer)
    return null
  }

  const show = () => {
    showTimer = null
    if (bar) return
    bar = document.createElement('div')
    bar.className = 'novel-navprogress'
    document.body.appendChild(bar)
    // 下一帧再改宽度，过渡才有起点
    requestAnimationFrame(() => {
      if (bar) bar.style.width = '80%'
    })
  }

  const finish = () => {
    if (!bar) return
    const el = bar
    bar = null
    el.style.width = '100%'
    el.style.opacity = '0'
    hideTimer = setTimeout(() => el.remove(), DONE_HOLD)
  }

  onNavigationStart(() => {
    hideTimer = stop(hideTimer)
    showTimer = stop(showTimer)
    showTimer = setTimeout(show, SHOW_DELAY)
  })

  onNavigationEnd(() => {
    // 够快：把还没出现的取消掉，别闪
    showTimer = stop(showTimer)
    finish()
  })
}
