import { defineComponent, h, computed, onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'

/** 和 config.mts 里那段防闪烁脚本共用的键名 */
export const READER_STORAGE_KEY = 'novel-reader-settings'

const DEFAULTS = { size: 17, leading: 1.95, font: 'sans' as 'sans' | 'serif' }
const SIZE_RANGE = { min: 14, max: 24, step: 1 }
const LEADING_RANGE = { min: 1.5, max: 2.6, step: 0.05 }

type Settings = typeof DEFAULTS

/** 把设置写到 <html> 上：字号与行距是 CSS 变量，字体是一个类名 */
function apply(settings: Settings) {
  const root = document.documentElement
  root.style.setProperty('--novel-reader-size', `${settings.size}px`)
  root.style.setProperty('--novel-reader-leading', String(settings.leading))
  root.classList.toggle('reader-serif', settings.font === 'serif')
}

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(READER_STORAGE_KEY) || 'null')
    return {
      size: Number(saved?.size) || DEFAULTS.size,
      leading: Number(saved?.leading) || DEFAULTS.leading,
      font: saved?.font === 'serif' ? 'serif' : 'sans'
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
 * 阅读设置：字号、行距、字体。
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

    onMounted(() => {
      settings.value = load()
      apply(settings.value)
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
    const slider = (label: string, key: 'size' | 'leading', range: typeof SIZE_RANGE) =>
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
          key === 'size' ? `${settings.value.size}px` : settings.value.leading.toFixed(2)
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

    const panel = () =>
      h('div', { class: 'reader-panel' }, [
        h('div', { class: 'reader-title' }, '阅读设置'),
        slider('字号', 'size', SIZE_RANGE),
        slider('行距', 'leading', LEADING_RANGE),
        h('div', { class: 'reader-row' }, [
          h('span', { class: 'reader-label' }, '字体'),
          h('span', { class: 'reader-fonts' }, [fontButton('sans', '黑体'), fontButton('serif', '宋体')])
        ]),
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
            title: '阅读设置（字号 / 行距 / 字体）',
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
