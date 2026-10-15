import { defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useData, useRoute } from 'vitepress'

/**
 * 章节页底部的评论区（giscus，基于 GitHub Discussions）。
 *
 * 参数写在 docs/site.json 的 comment 里；`repoId` / `categoryId` 还没填时，
 * 这个组件什么都不渲染——所以就算没配好，站点也不会出现一个空框。
 *
 * 两个细节：
 * - giscus 是按页面路径挂载的（mapping: pathname），但 VitePress 的 Layout 常驻，
 *   切章不会重建组件，所以这里监听路由变化，手动把 iframe 卸掉重挂。
 * - 主题跟着 VitePress 的明暗开关走（而不是系统的），这样切到深色时评论区也一起变。
 */

type CommentConfig = {
  provider?: string
  repo?: string
  repoId?: string
  category?: string
  categoryId?: string
  mapping?: string
  reactionsEnabled?: string
  inputPosition?: string
  theme?: string
  lang?: string
}

function readConfig(): CommentConfig | null {
  try {
    const site = (window as unknown as { __NOVEL_SITE__?: { comment?: CommentConfig | null } }).__NOVEL_SITE__
    const comment = site?.comment
    if (comment?.provider !== 'giscus') return null
    if (!comment.repo || !comment.repoId || !comment.categoryId) return null
    return comment
  } catch {
    return null
  }
}

export default defineComponent({
  name: 'Giscus',
  setup() {
    const { frontmatter, isDark } = useData()
    const route = useRoute()
    const config = readConfig()
    const host = ref<HTMLElement | null>(null)
    let script: HTMLScriptElement | null = null

    const visible = () => frontmatter.value.pageClass === 'novel-chapter'

    const mount = () => {
      const el = host.value
      if (!el || !config) return
      // 先清掉上一个页面的 iframe 与脚本，避免两份评论区叠在一起
      el.innerHTML = ''
      script?.remove()

      const box = document.createElement('div')
      box.className = 'giscus'
      el.appendChild(box)

      const attrs: Record<string, string> = {
        'data-repo': config.repo!,
        'data-repo-id': config.repoId!,
        'data-category': config.category || 'General',
        'data-category-id': config.categoryId!,
        'data-mapping': config.mapping || 'pathname',
        'data-strict': '0',
        'data-reactions-enabled': config.reactionsEnabled ?? '1',
        'data-emit-metadata': '0',
        'data-input-position': config.inputPosition || 'top',
        // 默认跟明暗开关走；site.json 里指定了具体主题就用它
        'data-theme': config.theme && config.theme !== 'preferred_color_scheme' ? config.theme : isDark.value ? 'dark' : 'light',
        'data-lang': config.lang || 'zh-CN',
        crossorigin: 'anonymous',
        async: 'true',
        src: 'https://giscus.app/client.js'
      }

      script = document.createElement('script')
      for (const [key, value] of Object.entries(attrs)) script.setAttribute(key, value)
      box.appendChild(script)
    }

    onMounted(mount)
    onBeforeUnmount(() => script?.remove())

    // 换章 / 切明暗时重新挂载
    watch([() => route.path, isDark], () => {
      if (visible()) mount()
    })

    return () => {
      if (!config || !visible()) return null
      return h('div', { class: 'novel-comments', ref: host })
    }
  }
})
