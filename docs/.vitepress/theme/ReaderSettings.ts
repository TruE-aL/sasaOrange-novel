import { defineComponent, h, computed, onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

/** 和 config.mts 里那段防闪烁脚本共用的键名。改了默认值就升版本号，读者那边会回到新默认 */
export const READER_STORAGE_KEY = 'novel-reader-settings-v2'

const DEFAULTS = {
  size: 20,
  leading: 1.95,
  font: 'serif' as 'sans' | 'serif',
  // 正文版心宽度（px）。目录收起后空间让出来，可以拉得更宽
  measure: 720
}
const SIZE_RANGE = { min: 14, max: 32, step: 1 }
const LEADING_RANGE = { min: 1.5, max: 2.6, step: 0.05 }

/**
 * 版心宽度：给一个够大的统一区间（480–1400）即可。
 *
 * 不需要按目录状态切两档——因为目录折叠走的是 CSS 宽度过渡（见 SidebarToggle），
 * 收起后腾出的空间会直接反映到版心上，滑块只是用来「手动微调」，
 * 上限放宽到 1400 是为了让愿意铺满的读者拉得开。
 */
const MEASURE_RANGE = { min: 480, max: 1400, step: 10 }

type Settings = typeof DEFAULTS

/** 把设置写到 <html> 上：字号 / 行距 / 版心宽都是 CSS 变量 */
function apply(settings: Settings) {
  const root = document.documentElement
  root.style.setProperty('--novel-reader-size', `${settings.size}px`)
  root.style.setProperty('--novel-reader-leading', String(settings.leading))
  root.style.setProperty('--novel-measure', `${settings.measure}px`)
  root.classList.toggle('reader-sans', settings.font === 'sans')
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || 'null')
    return {
      size: Number(saved?.size) || DEFAULTS.size,
      leading: Number(saved?.leading) || DEFAULTS.leading,
      font: saved?.font === 'sans' ? 'sans' : 'serif',
      measure: Number(saved?.measure) || DEFAULTS.measure
    }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(settings: Settings) {
  try {
    localStorage.setItem(READER_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式写不了也没关系，只是记不住
  }
}

/**
 * 阅读设置：字号、行距、字体，以及桌面端的「章节目录开关」和「版心宽度」。
 * 只在章节页显示（其它页面改了也看不出效果），选择记在 localStorage 里，
 * 首屏脚本会先把变量写好，所以刷新不会闪一下。
 */
export default defineComponent({
  name: 'ReaderSettings',
  props: {
    withLabel: { type: Boolean, default: false }
  },
  setup(props) {
    const { frontmatter } = useData()
    const settings = ref<Settings>({ ...DEFAULTS })
    const open = ref(false)

    // 只有正文页才需要这个入口
    const visible = computed(() => frontmatter.value.pageClass === 'novel-chapter')

    // 目录、版心这类是桌面端能力：手机上没有侧边栏，套版心宽度也没意义
    const isDesktop = ref(false)
    const mql = typeof window !== 'undefined' ? window.matchMedia('(min-width: 960px)') : null

    onMounted(() => {
      settings.value = load()
      apply(settings.value)
      isDesktop.value = mql ? mql.matches : false
      mql?.addEventListener('change', syncDesktop)
    })

    function syncDesktop(event: MediaQueryListEvent) {
      isDesktop.value = event.matches
    }

    onUnmounted(() => {
      mql?.removeEventListener('change', syncDesktop)
    })

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') open.value = false
    }
    onMounted(() => document.addEventListener('keydown', onKeydown))
    onUnmounted(() => document.removeEventListener('keydown', onKeydown))

    const update = (patch: Partial<Settings>) => {
      settings.value = { ...settings.value, ...patch }
      apply(settings.value)
      save(settings.value)
    }

    const reset = () => update({ ...DEFAULTS })

    /** 一行设置：标签 + 滑块 + 当前值 */
    const slider = (
      label: string,
      key: 'size' | 'leading' | 'measure',
      range: { min: number; max: number; step: number },
      format?: (value: number) => string
    ) =>
      h('label', { class: 'reader-row' }, [
        h('span', { class: 'reader-label' }, label),
        h('input', {
          type: 'range',
          min: range.min,
          max: range.max,
          step: range.step,
          value: settings.value[key],
          'aria-label': label,
          onInput: (event: Event) =>
            update({ [key]: Number((event.target as HTMLInputElement).value) } as Partial<Settings>)
        }),
        h(
          'span',
          { class: 'reader-value' },
          format ? format(settings.value[key]) : String(settings.value[key])
        )
      ])

    const fontButton = (value: 'sans' | 'serif', label: string) =>
      h(
        'button',
        {
          type: 'button',
          class: ['reader-font-btn', { active: settings.value.font === value, serif: value === 'serif' }],
          'aria-pressed': String(settings.value.font === value),
          onClick: () => update({ font: value })
        },
        label
      )

    /**
     * 桌面端专属：版心宽度。
     * 目录的收起/展开由独立的悬浮按钮负责（SidebarToggle.ts），这里只放宽度。
     */
    const desktopSection = () => [
      slider('版心', 'measure', MEASURE_RANGE, (value) => `${value}px`),
      h('p', { class: 'reader-hint' }, '收起目录后，这里可以拉得更宽')
    ]

    const panel = () =>
      h('div', { class: 'reader-panel' }, [
        h('div', { class: 'reader-title' }, '阅读设置'),
        slider('字号', 'size', SIZE_RANGE, (value) => `${value}px`),
        slider('行距', 'leading', LEADING_RANGE, (value) => value.toFixed(2)),
        h('div', { class: 'reader-row' }, [
          h('span', { class: 'reader-label' }, '字体'),
          h('span', { class: 'reader-fonts' }, [fontButton('serif', '宋体'), fontButton('sans', '黑体')])
        ]),
        isDesktop.value ? h('div', { class: 'reader-divider' }) : null,
        isDesktop.value ? desktopSection() : null,
        h(
          'button',
          { type: 'button', class: 'reader-reset', onClick: reset },
          '恢复默认'
        )
      ])

    return () => {
      if (!visible.value) return null
      return h('div', { class: ['novel-reader', { 'is-mobile': props.withLabel }] }, [
        props.withLabel ? h('span', { class: 'reader-inline-label' }, '阅读设置') : null,
        h(
          'button',
          {
            type: 'button',
            class: 'novel-reader-toggle',
            title: '阅读设置（字号 / 行距 / 字体 / 目录 / 版心）',
            'aria-label': '阅读设置',
            'aria-expanded': String(open.value),
            onClick: () => {
              open.value = !open.value
            }
          },
          'Aa'
        ),
        open.value
          ? h('div', { class: 'reader-panel-wrap' }, [
              h('div', { class: 'reader-backdrop', onClick: () => (open.value = false) }),
              panel()
            ])
          : null
      ])
    }
  }
})
