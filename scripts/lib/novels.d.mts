export type Chapter = {
  file: string
  label: string
  title: string
  href: string
  listText: string
  pagerText: string
  words: number
  mtime: number
}

export type Novel = {
  folder: string
  sourceDir: string
  slug: string
  base: string
  title: string
  author: string
  tagline: string
  description: string
  status: string
  license: string
  licenseUrl: string
  start: string
  licenseFile: string
  licensePage: string
  coverFile: string
  /** 分享卡（og:image）用的封面地址；有封面文件就有值，与卡片是否显示无关 */
  cover: string
  /** 书架卡片是否显示封面（novel.json 显式开启 cover 才为 true） */
  showCover: boolean
  updated: number
  chapters: Chapter[]
  stats: { chapters: number; words: number; extras: string[] }
}

export type Section = { id: string; title: string; description?: string }

export type CommentConfig = {
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

export type Site = {
  title: string
  author: string
  icon?: string
  url?: string
  heroTitle?: string
  heroSubtitle?: string
  tagline: string
  footer?: { message?: string; copyright?: string }
  comment?: CommentConfig
  sections: Section[]
}

export declare function loadNovels(contentDir: string): { site: Site; novels: Novel[] }
export declare function readText(file: string): string
export declare function readJson<T>(file: string, fallback: T): T
export declare function yaml(value: unknown): string
export declare function naturalSort(a: string, b: string): number
