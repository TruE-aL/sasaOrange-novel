import { defineComponent, h, onMounted, ref } from 'vue'

/** localStorage 里的键名，和 config.mts 里那段防闪烁脚本共用 */
export const SCHEME_STORAGE_KEY = 'novel-color-scheme'

/**
 * 三套配色。warm 是默认，写在 theme.css 的 :root/.dark 里，不加任何 class；
 * 其它配色各自加一个 html.theme-<id> 类名。
 */
const SCHEMES = [
  { id: 'warm', label: '暖黄色系', hint: '暖黄（护眼，默认）' },
  { id: 'orange', label: '淡橙红色系', hint: '淡橙红（与 orange 呼应）' },
  { id: 'blue', label: '淡蓝色系', hint: '淡蓝' }
] as const

type SchemeId = (typeof SCHEMES)[number]['id']

const CLASSES = SCHEMES.filter((scheme) => scheme.id !== 'warm').map((scheme) => `theme-${scheme.id}`)

export default defineComponent({
  name: 'SchemeSwitch',
  props: {
    withLabel: { type: Boolean, default: false }
  },
  setup(props) {
    const current = ref<SchemeId>('warm')

    const apply = (scheme: SchemeId) => {
      current.value = scheme
      for (const className of CLASSES) {
        document.documentElement.classList.toggle(className, className === `theme-${scheme}`)
      }
    }

    onMounted(() => {
      // 以页面上实际生效的 class 为准，避免首屏脚本和这里的状态打架
      const active = CLASSES.find((className) => document.documentElement.classList.contains(className))
      current.value = (active?.replace('theme-', '') as SchemeId) || 'warm'
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
