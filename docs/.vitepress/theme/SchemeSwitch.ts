import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vitepress'

/** 读者「明确选过」的配色存在这里；没存过就走按页面算的默认值 */
export const SCHEME_STORAGE_KEY = 'novel-color-scheme'

/**
 * 三套配色。warm 是基础色，写在 theme.css 的 :root/.dark 里，不加任何 class；
 * 其它配色各自加一个 html.theme-<id> 类名。
 */
const SCHEMES = [
  { id: 'warm', label: '暖黄色系', hint: '暖黄（护眼，默认）' },
  { id: 'orange', label: '淡橙红色系', hint: '淡橙红（与 orange 呼应）' },
  { id: 'blue', label: '淡蓝色系', hint: '淡蓝' }
] as const

type SchemeId = (typeof SCHEMES)[number]['id']

const IDS = SCHEMES.map((scheme) => scheme.id) as readonly SchemeId[]
/** 除了默认的 warm，其它配色都要挂到 <html> 上的类名 */
const CLASSES = SCHEMES.filter((scheme) => scheme.id !== 'warm').map((scheme) => `theme-${scheme.id}`)

/** 首页（书架）用淡橙红当门面，正文等其它页面用护眼的暖黄 */
function pageDefault(path: string): SchemeId {
  return path === '/' || path === '' ? 'orange' : 'warm'
}

/** 读读者明确选过的配色；没选过（或值不认识）返回 null */
function storedChoice(): SchemeId | null {
  try {
    const saved = localStorage.getItem(SCHEME_STORAGE_KEY)
    // 早先那套淡绿换成了淡橙红，老值直接对上
    if (saved === 'green') return 'orange'
    return IDS.includes(saved as SchemeId) ? (saved as SchemeId) : null
  } catch {
    return null
  }
}

function apply(scheme: SchemeId) {
  for (const className of CLASSES) {
    document.documentElement.classList.toggle(className, className === `theme-${scheme}`)
  }
}

export default defineComponent({
  name: 'SchemeSwitch',
  props: {
    withLabel: { type: Boolean, default: false }
  },
  setup(props) {
    const route = useRoute()
    // null = 跟随页面默认；有值 = 读者自己选的
    const chosen = ref<SchemeId | null>(null)
    const current = computed(() => chosen.value ?? pageDefault(route.path))

    onMounted(() => {
      chosen.value = storedChoice()
      // 首屏脚本已经先应用过一次，这里再对齐一遍（幂等）
      apply(current.value)
    })

    // 换页时：读者没选过就跟着页面的默认值走
    watch(
      () => [route.path, chosen.value] as const,
      () => apply(current.value)
    )

    const pick = (scheme: SchemeId) => {
      if (chosen.value === scheme) {
        // 再点一次当前配色 = 恢复「跟随页面默认」
        chosen.value = null
        try {
          localStorage.removeItem(SCHEME_STORAGE_KEY)
        } catch {
          // 隐私模式忽略
        }
        return
      }
      chosen.value = scheme
      try {
        localStorage.setItem(SCHEME_STORAGE_KEY, scheme)
      } catch {
        // 隐私模式忽略
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
              title:
                current.value === scheme.id
                  ? `${scheme.hint}（再点一次恢复跟随页面默认）`
                  : `切换到${scheme.label}`,
              'aria-label': `切换到${scheme.label}`,
              'aria-pressed': String(current.value === scheme.id),
              onClick: () => pick(scheme.id)
            })
          )
        ]
      )
  }
})
