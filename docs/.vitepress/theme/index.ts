import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import ReaderSettings from './ReaderSettings'
import SchemeSwitch from './SchemeSwitch'
import { installReadingProgress } from './readingProgress'
import './theme.css'

// 在 VitePress 默认主题的基础上，加了一套暖黄色系（默认）和一套淡蓝色系，
// 并把切换按钮挂到顶栏和手机菜单上
export default {
  extends: DefaultTheme,
  enhanceApp({ router }: { router: import('vue-router').Router }) {
    // 只在浏览器里跑：记住每章读到哪、下次接着读
    if (typeof window !== 'undefined') installReadingProgress(router)
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => [h(SchemeSwitch), h(ReaderSettings)],
      'nav-screen-content-after': () => [h(SchemeSwitch, { withLabel: true }), h(ReaderSettings, { withLabel: true })]
    })
  }
}
