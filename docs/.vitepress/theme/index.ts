import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import ReaderSettings from './ReaderSettings'
import ReadingProgress from './ReadingProgress'
import SchemeSwitch from './SchemeSwitch'
import SidebarToggle from './SidebarToggle'
import ChapterEnd from './ChapterEnd'
import Giscus from './Giscus'
import { installNavProgress } from './NavProgress'
import { installAppearanceTransition } from './AppearanceTransition'
import { installNavigation, type VitePressRouter } from './navigation'
import { installReadingProgress } from './readingProgress'
import { installShelf } from './shelf'
import './theme.css'

/** 出错时把消息拼成一行，方便在控制台一眼看出是什么问题 */
const describe = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

/**
 * 这几个都是「增强」功能：阅读进度、切页加载条、书架「继续阅读」。
 * 任何一个出问题都不该让整站白屏，所以每个都单独 try 起来，只记一行日志。
 */
function safely(label: string, run: () => void) {
  try {
    run()
  } catch (error) {
    console.error(`[novel] ${label}初始化失败：${describe(error)}`)
  }
}

// 在 VitePress 默认主题的基础上，加了一套暖黄色系（默认）和一套淡蓝色系，
// 并把切换按钮挂到顶栏和手机菜单上
export default {
  extends: DefaultTheme,
  enhanceApp({
    app,
    router
  }: {
    app: {
      provide: (key: string, value: unknown) => void
      runWithContext: <T>(fn: () => T) => T
    }
    router: unknown
  }) {
    if (typeof window === 'undefined') return
    // VitePress 2 自带路由（不是 vue-router），类型声明上游还是旧的，这里按实际情况转一下
    const nav = router as VitePressRouter
    safely('导航钩子', () => installNavigation(nav))
    safely('阅读进度', () => installReadingProgress(nav))
    safely('导航加载条', () => installNavProgress())
    safely('书架增强', () => installShelf())
    // 注意用 app.provide / app.runWithContext：VitePress 的 enhanceApp 上下文里
    // 只有 app / router / siteData，并没有 Vue createApp 那种顶层 provide。
    safely('明暗切换动画', () =>
      installAppearanceTransition(
        (key, value) => app.provide(key, value),
        (fn) => app.runWithContext(fn)
      )
    )
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => [h(SchemeSwitch), h(ReaderSettings)],
      'nav-screen-content-after': () => [h(SchemeSwitch, { withLabel: true }), h(ReaderSettings, { withLabel: true })],
      'layout-top': () => h(ReadingProgress),
      // 章节目录折叠按钮（仅桌面端正文页，组件自己判断）
      'layout-bottom': () => h(SidebarToggle),
      // 正文页页尾：本章完的落款 + 评论区（其它页面这两个组件自己返回空）
      'doc-after': () => [h(ChapterEnd), h(Giscus)]
    })
  }
}
