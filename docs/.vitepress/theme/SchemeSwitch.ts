import { defineComponent, h, onMounted, ref } from 'vue'

/** localStorage 里的键名，和 config.mts 里那段防闪烁脚本共用 */
export const SCHEME_STORAGE_KEY = 'novel-color-scheme'

const SCHEMES = [
  { id: 'warm', label: '暖黄色系', hint: '暖黄（护眼，默认）' },
  { id: 'blue', label: '淡蓝色系', hint: '淡蓝' }
] as const

type SchemeId = (typeof SCHEMES)[number]['id']

/**
 * 配色切换按钮：两个小圆点，暖黄 / 淡蓝。
 * 默认暖黄（不加任何 class），选淡蓝时给 <html> 加 theme-blue。
 */
export default defineComponent({
  name: 'SchemeSwitch',
  props: {
    withLabel: { type: Boolean, default: false }
  },
  setup(props) {
    const current = ref<SchemeId>('warm')

    const apply = (scheme: SchemeId) => {
      current.value = scheme
      document.documentElement.classList.toggle('theme-blue', scheme === 'blue')
    }

    onMounted(() => {
      // 以页面上实际生效的 class 为准，避免首屏脚本和这里的状态打架
      current.value = document.documentElement.classList.contains('theme-blue') ? 'blue' : 'warm'
    })

    const pick = (scheme: SchemeId) => {
      apply(scheme)
      try {
        localStorage.setItem(SCHEME_STORAGE_KEY, scheme)
      } catch {
        // 隐私模式下写不了 localStorage 也没关系，只是记不住选择
      }
    }

    return () =>
      h(
        'div',
        { class: ['novel-scheme-switch', { 'is-mobile': props.withLabel }] },
        [
          props.withLabel ? h('span', { class: 'label' }, '阅读配色') : null,
          ...SCHEMES.map((scheme) =>
            h('button', {
              type: 'button',
              class: ['swatch', scheme.id],
              title: scheme.hint,
              'aria-label': `切换到${scheme.label}`,
              'aria-pressed': String(current.value === scheme.id),
              onClick: () => pick(scheme.id)
            })
          )
        ]
      )
  }
})
