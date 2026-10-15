import { useData } from 'vitepress'

/**
 * 明暗切换的「圆形扩散」动画。
 *
 * 点顶栏那个太阳/月亮按钮时，新主题以鼠标点击处为圆心，像水波一样扩开铺满整屏。
 *
 * 实现思路取自 JinRudy/JinRudy.github.io 的 shuimo.js + shuimo.css ——
 * 那套做法比"双向动画"简单一个数量级，而且从架构上就绕开了好几个坑，值得照抄：
 *
 *   · 图层顺序**写死**：old 永远在下面、new 永远在上面，不需要按当前主题去翻转；
 *   · 动画**永远只打在 new 上**、方向**永远是「从点击处铺开」**，不做「收回」；
 *   · 于是两个方向（浅→深、深→浅）走的是同一套代码，没有"方向搞反"这回事。
 *
 * 为什么之前那版会闪（记下来，免得日后又绕回去）：
 *   当时做的是「双向 out-in」—— 切到深色时，让旧的那张（浅色）从全屏**收回**到点击处。
 *   但 View Transitions 有个天然的间隙：`vt.ready` 之后到我们 animate() 接手之前，
 *   上层快照会先按「原样」显示一帧。双向方案里，切深色时上层是**旧主题（浅色）**，
 *   和终态（深色）相反 —— 那一帧就特别扎眼，看着像"唰地闪一下"。
 *   改成"永远铺开、new 永远在上"之后，那一帧露出的就是**新主题**，跟终态一致，察觉不到。
 *
 * 另外两点适配（相对原版）：
 *   · 原版用 <html data-theme="dark">，本站用的是 VitePress 原生的 <html class="dark">；
 *   · 原版动画没设 fill（默认 none），连点理论上会堆叠 —— 这里补上 fill:'forwards'
 *     并在播完 cancel 掉，防连点打架。
 */

/** View Transitions 用不了、或读者要求减弱动效时，退回最朴素的直接切换 */
function canAnimate(): boolean {
  return (
    typeof document !== 'undefined' &&
    'startViewTransition' in document &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  )
}

/**
 * 扩散时长/缓动以 theme.css 的 CSS 变量为准，JS 只管读 ——
 * 这样「圆形扩散」和「顶栏小滑块的位移」一定同步。
 * （VitePress 原生给滑块的是 transition: transform 0.25s，和扩散不同步的话，
 *   滑块会 250ms 就滑到位、杵在那儿等动画跑完，看着像"开关抢先跳过去"。）
 * 读不到变量时退回下面这份默认值。
 */
const DURATION_FALLBACK = 700
const EASING_FALLBACK = 'cubic-bezier(0.4, 0, 0.2, 1)'

function readTiming() {
  const styles = getComputedStyle(document.documentElement)
  const raw = styles.getPropertyValue('--novel-appearance-duration').trim()
  // CSS 里写的是 0.56s，Web Animations 要毫秒数
  const seconds = raw.endsWith('s') ? Number.parseFloat(raw) : Number.parseFloat(raw) / 1000
  return {
    duration:
      Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : DURATION_FALLBACK,
    easing: styles.getPropertyValue('--novel-appearance-ease').trim() || EASING_FALLBACK
  }
}

/**
 * 装配明暗切换动画。在 enhanceApp 里调一次。
 *
 * @param provide  app.provide，用来覆盖 VitePress 原生按钮的切换行为
 * @param runWithContext app.runWithContext，用来在组件外也能 inject 到 VitePress 的 data
 */
export function installAppearanceTransition(
  provide: (key: string, value: unknown) => void,
  runWithContext: <T>(fn: () => T) => T
) {
  // useData() 内部其实是 inject(dataSymbol)，inject 必须在组件上下文里才取得到。
  // enhanceApp 阶段没有组件实例，直接用会抛 "vitepress data not properly injected in app"，
  // 所以用 app.runWithContext 包一层。
  const isDark = runWithContext(() => useData().isDark) as unknown as { value: boolean }

  /**
   * 为什么可以零侵入接管原生按钮：
   * VitePress 的 VPSwitchAppearance 是 inject('toggle-appearance') 拿切换函数的
   * （上游只 inject、从不 provide，就是留给主题覆盖的扩展点），模板写的是
   * @click="toggleAppearance" —— MouseEvent 原样传进来，坐标天然就有。
   */
  provide('toggle-appearance', (event?: MouseEvent) => {
    const root = document.documentElement

    const toggle = () => {
      isDark.value = !isDark.value
      // VueUse 的 useDark 是靠 watchEffect 往 <html> 上挂 .dark 的，是异步的。
      // 这里手动同步落一次，保证「动画抓到的新快照」一定是新主题（否则会抓到旧的）。
      // useDark 的 watchEffect 稍后会再写一次同样的值，纯幂等。
      root.classList.toggle('dark', isDark.value)
    }

    if (!canAnimate()) {
      toggle()
      return
    }

    // 拿不到坐标时（键盘 Enter 触发等）退回按钮中心，动画从按钮长出来
    const target = event?.currentTarget as HTMLElement | undefined
    const rect = target?.getBoundingClientRect?.()
    const x = event?.clientX ?? (rect ? rect.left + rect.width / 2 : window.innerWidth / 2)
    const y = event?.clientY ?? (rect ? rect.top + rect.height / 2 : window.innerHeight / 2)
    // 盖满全屏所需半径：到最远那个角的距离，少一点斜对角就会露边
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))

    const transition = document.startViewTransition(toggle)

    transition.ready
      .then(() => {
        const timing = readTiming()
        const animation = root.animate(
          // 永远是从点击处的 0 半径，扩到盖满全屏 —— 两个方向都是这一套
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          {
            duration: timing.duration,
            easing: timing.easing,
            fill: 'forwards',
            pseudoElement: '::view-transition-new(root)'
          }
        )
        // 播完把动画撤掉，别让它以 finished 状态一直挂在伪元素上（连点会堆叠打架）
        animation.finished
          .then(() => animation.cancel())
          .catch(() => {
            /* 中途被取消会 reject，属正常 */
          })
      })
      .catch(() => {
        /* VT 被跳过时 ready 会 reject，此时主题已经切好了，忽略即可 */
      })
  })
}
