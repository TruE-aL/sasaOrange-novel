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
  cover: string
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
