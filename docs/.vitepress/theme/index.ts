import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import SchemeSwitch from './SchemeSwitch'
import './theme.css'

// 在 VitePress 默认主题的基础上，加了一套暖黄色系（默认）和一套淡蓝色系，
// 并把切换按钮挂到顶栏和手机菜单上
export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(SchemeSwitch),
      'nav-screen-content-after': () => h(SchemeSwitch, { withLabel: true })
    })
  }
}
