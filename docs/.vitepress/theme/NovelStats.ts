import { defineComponent, h } from 'vue'

/** 由 config.mts 在构建时统计并注入（vite.define） */
declare const __NOVEL_STATS__: {
  chapters: number
  words: number
  extras: string[]
}

/**
 * 首页那句话：「正文共 14 章，另有导语、序章、尾声与后记，约 2.9 万字。」
 * 数字在构建时从 docs/chapters 统计，写完新章节重新构建就会自动更新。
 * 用法：在 markdown 里写 <NovelStats />
 */
export default defineComponent({
  name: 'NovelStats',
  setup() {
    return () => {
      const { chapters, words, extras } = __NOVEL_STATS__
      const parts = [`正文共 ${chapters} 章`]
      if (extras.length > 0) {
        parts.push(`另有${extras.join('、')}`)
      }
      parts.push(`约 ${(words / 10000).toFixed(1)} 万字`)
      return h('p', parts.join('，') + '。')
    }
  }
})
