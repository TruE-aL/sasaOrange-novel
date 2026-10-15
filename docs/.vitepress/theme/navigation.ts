/**
 * 导航钩子的统一接入口。
 *
 * 为什么要有这一层：VitePress 2.0.0-alpha 已经不用 vue-router 了，它自带一个极简路由，
 * 钩子是**单个属性**（`router.onBeforePageLoad` / `router.onAfterRouteChange`…），
 * 谁后写谁覆盖。所以站点里想在切页时做点事的模块（阅读进度、加载条、书架增强）
 * 不能各自去赋值，必须一起登记到这里的监听表，由这里统一挂一次。
 *
 * 注意：主题的类型声明里 `enhanceApp` 收到的还是 vue-router 的 Router（上游没跟上），
 * 运行时其实是 VitePress 自己这个，所以这里直接用 `vitepress` 导出的 Router 类型。
 */
import type { Router } from 'vitepress'

export type VitePressRouter = Router

/**
 * 统一路径写法：去掉查询串与锚点、解码 %XX、去掉结尾的 .html / index.html。
 *
 * 三处写法各异，都靠这一个函数对齐：
 *   - 配置/侧边栏里的 href：干净的 `/novels/x/03-第一章`
 *   - 路由路径：VitePress 2 在 cleanUrls 关闭时会补成 `.html`
 *   - 路由钩子传回来的 href：还会带上 `?query` 与 `#hash`
 * 章节身份只由路径决定，查询串与锚点不参与，所以一并去掉。
 */
export function normalizePath(path: string): string {
  let value = path.split('#')[0].split('?')[0]
  try {
    value = decodeURIComponent(value)
  } catch {
    // 编码不合法就按原样用
  }
  return value.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '').replace(/\/index$/, '/')
}

type Listener = (to: string) => void

const startListeners: Listener[] = []
const endListeners: Listener[] = []

/** 切页开始前（新页面还没加载出来）会调用；这是「离开当前页」的最后时机 */
export function onNavigationStart(listener: Listener) {
  startListeners.push(listener)
}

/** 切页结束（新页面已经确定）会调用 */
export function onNavigationEnd(listener: Listener) {
  endListeners.push(listener)
}

function run(listeners: Listener[], to: string) {
  for (const listener of listeners) {
    try {
      listener(to)
    } catch (error) {
      console.error('[novel] 导航监听出错：', error)
    }
  }
}

let installed = false

/** 把钩子挂到路由上；只挂一次（多个模块共用，别互相覆盖） */
export function installNavigation(router: VitePressRouter) {
  if (installed) return
  installed = true

  const previousPageLoad = router.onBeforePageLoad
  const previousAfterRoute = router.onAfterRouteChange

  // 用 onBeforePageLoad 而不是 onBeforeRouteChange：链接点击、前进后退、首屏
  // 三种情况都会经过它，一个钩子就够（首屏也会经过，见 app/index.js 的启动流程）。
  router.onBeforePageLoad = (to) => {
    const result = previousPageLoad?.(to)
    run(startListeners, to)
    return result
  }

  router.onAfterRouteChange = (to) => {
    const result = previousAfterRoute?.(to)
    run(endListeners, to)
    return result
  }
}

/** 当前页面路径（已规范化） */
export function currentRoutePath(router: VitePressRouter): string {
  return normalizePath(router.route?.path || '')
}
