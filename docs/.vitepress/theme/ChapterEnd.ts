import { defineComponent, h } from 'vue'
import { useData } from 'vitepress'

/**
 * 正文页页尾的一枚小落款：「本章完 · 约 N 字」。
 * 字数由 config.mts 的 transformPageData 写进 frontmatter（构建时算好的），
 * 只在章节页出现，其它页面返回 null。
 */
export default defineComponent({
  name: 'ChapterEnd',
  setup() {
    const { frontmatter } = useData()

    return () => {
      if (frontmatter.value.pageClass !== 'novel-chapter') return null
      const words = Number(frontmatter.value.chapterWords) || 0
      return h('div', { class: 'novel-chapter-end' }, [
        h('span', { class: 'novel-chapter-end-rule', 'aria-hidden': 'true' }),
        h('span', { class: 'novel-chapter-end-text' }, words ? `本章完 · 约 ${words} 字` : '本章完'),
        h('span', { class: 'novel-chapter-end-rule', 'aria-hidden': 'true' })
      ])
    }
  }
})
