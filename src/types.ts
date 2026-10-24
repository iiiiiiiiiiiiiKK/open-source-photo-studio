// 全局类型定义：项目元信息、文案、设计稿状态。

export type RatioId = '16:9' | '1:1' | '3:4'

export type TemplateId = 'card' | 'terminal' | 'editorial' | 'poster' | 'collage' | 'architecture'

export type FontId = 'sans' | 'serif' | 'mono' | 'rounded'

export interface LanguageShare {
  name: string
  percent: number
}

export interface ScreenshotAsset {
  url: string
  kind: 'capture' | 'readme' | 'og' | 'icon' | 'manual'
  label: string
  width?: number
  height?: number
}

export interface HomepageMeta {
  title?: string
  description?: string
  ogImage?: string
  icon?: string
  themeColor?: string
  url?: string
}

export interface ProjectInfo {
  source: 'github' | 'website' | 'manual'
  sourceUrl: string
  fetchedAt: string
  name: string
  fullName?: string
  owner?: string
  ownerAvatar?: string
  title?: string
  description: string
  homepage?: string
  repoUrl?: string
  url?: string
  host?: string
  siteName?: string
  icon?: string
  ogImage?: string
  themeColor?: string
  h1?: string
  textSample?: string
  repoLinks?: string[]
  license?: string
  licenseName?: string
  language?: string
  languages?: LanguageShare[]
  stars?: number | null
  forks?: number | null
  issues?: number | null
  watchers?: number | null
  topics?: string[]
  createdAt?: string
  pushedAt?: string
  archived?: boolean
  isFork?: boolean
  defaultBranch?: string
  latestRelease?: { tag: string; name: string; publishedAt: string } | null
  readmeImages?: string[]
  readmeExcerpt?: string[]
  readmeRawTruncated?: string
  socialPreview?: string
  screenshots: ScreenshotAsset[]
  homepageMeta?: HomepageMeta
  notes?: string[]
}

export interface CopyMetric {
  key: string
  label: string
  value: string
  known: boolean
  raw?: number | null
  source?: string
}

export interface CopyFact {
  label: string
  value: string
  source: string
}

export interface CopyHighlight {
  text: string
  evidence: string
}

export interface GeneratedCopy {
  mode: 'deterministic' | 'ai' | 'manual'
  generatedAt: string
  aiModel?: string
  title: string
  subtitle: string
  oneLiner: string
  highlights: CopyHighlight[]
  body: string
  audience: string[]
  techStack: { name: string; note: string }[]
  tweet: string
  metrics: CopyMetric[]
  facts: CopyFact[]
  warnings: string[]
  tone?: string
}

export interface MetricState {
  key: string
  label: string
  value: string
  known: boolean
  visible: boolean
}

export interface DesignState {
  template: TemplateId
  ratio: RatioId
  title: string
  subtitle: string
  oneLiner: string
  body: string
  highlights: string[]
  metrics: MetricState[]
  tags: string[]
  techStack: { name: string; note: string }[]
  audience: string[]
  accent: string
  background: string
  font: FontId
  titleScale: number
  showHighlights: boolean
  showMetrics: boolean
  showTags: boolean
  showFooter: boolean
  footer: string
  badge: string
  imageId: string | null
  imageZoom: number
  imageOffsetX: number
  imageOffsetY: number
  /** cover=填满裁切，top=按宽度铺满并显示页面上部（最像真实浏览器），contain=完整显示 */
  imageTreatment: 'cover' | 'top' | 'contain'
  imageCorner: number
  texture: number
}

export interface ExtractResponse {
  ok: true
  elapsedMs: number
  project: ProjectInfo
  copy: GeneratedCopy
  screenshots: ScreenshotAsset[]
  shot: {
    id: string
    width: number
    height: number
    finalUrl: string
    title: string
    blocked: { url: string; reason: string }[]
    url: string
  } | null
  warnings: string[]
  ai: { requested: boolean; used: boolean; error: string }
  screenshotCapability: {
    available: boolean
    executablePath: string | null
    reason: string
    limits: { timeoutMs: number; maxHeight: number; maxWidth: number; maxConcurrent: number }
  }
}

export interface ApiError {
  error: string
  message: string
  hint?: string
}

export interface HealthResponse {
  ok: boolean
  time: string
  version: string
  screenshot: {
    available: boolean
    executablePath: string | null
    reason: string
    limits: { timeoutMs: number; maxHeight: number; maxWidth: number; maxConcurrent: number }
  }
  ai: { enabled: boolean; model: string | null }
  githubToken: boolean
  viewports: { key: string; label: string; width: number; height: number }[]
  cache: { screenshots: { entries: number; bytes: number }; images: { entries: number; bytes: number } }
}
