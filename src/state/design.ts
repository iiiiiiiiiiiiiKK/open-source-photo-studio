import type { DesignState, GeneratedCopy, ProjectInfo, RatioId, TemplateId } from '../types'
import { TEMPLATE_MAP } from '../render/templates'

export const ACCENT_PRESETS = [
  { name: '赤陶', value: '#B4542F' },
  { name: '墨绿', value: '#1F3A2E' },
  { name: '钴蓝', value: '#2F6BFF' },
  { name: '琥珀', value: '#D99A2B' },
  { name: '玫红', value: '#C63C6B' },
  { name: '松石', value: '#1E8E8A' },
  { name: '荧光绿', value: '#5BE49B' },
  { name: '紫罗兰', value: '#6C5CE7' },
]

export const BACKGROUND_PRESETS = [
  { name: '米纸', value: '#F4F1E9' },
  { name: '纯白', value: '#FFFFFF' },
  { name: '雾灰', value: '#EFEFEA' },
  { name: '浅蓝', value: '#EDF2F7' },
  { name: '墨黑', value: '#0E1117' },
  { name: '深蓝', value: '#101828' },
  { name: '炭灰', value: '#1A1A1D' },
  { name: '酒红', value: '#2A1416' },
]

export const FONT_OPTIONS = [
  { id: 'sans' as const, name: '无衬线', sample: '项目介绍 Aa 123' },
  { id: 'serif' as const, name: '衬线', sample: '项目介绍 Aa 123' },
  { id: 'mono' as const, name: '等宽', sample: '项目介绍 Aa 123' },
  { id: 'rounded' as const, name: '圆体', sample: '项目介绍 Aa 123' },
]

export const DEFAULT_FOOTER = ''

function trimArray(items: unknown, max: number, fallback: string[] = []): string[] {
  if (!Array.isArray(items)) return fallback
  const cleaned = items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return cleaned.length ? cleaned.slice(0, max) : fallback
}

export function buildInitialDesign(
  project: ProjectInfo | null,
  copy: GeneratedCopy | null,
  previous?: Partial<DesignState> | null,
  template?: TemplateId,
  ratio?: RatioId
): DesignState {
  const activeTemplate = template || 'card'
  const meta = TEMPLATE_MAP[activeTemplate]
  const heading = copy?.title || project?.name || project?.title || '未命名项目'

  // 指标：只保留有值或有明确"未知"标记的，且默认全部可见
  const metrics = (copy?.metrics || []).map((metric) => ({
    key: metric.key,
    label: metric.label,
    value: metric.value,
    known: metric.known,
    visible: true,
  }))

  const highlights = trimArray(
    copy?.highlights?.map((h) => h.text),
    5,
    []
  )

  const tags = trimArray(
    [...(project?.topics || []), ...(project?.languages || []).map((l) => l.name)],
    6,
    []
  )

  const subtitle =
    copy?.subtitle ||
    (project?.source === 'github'
      ? [project?.owner, project?.language, project?.license].filter(Boolean).join(' · ')
      : [project?.host, project?.siteName].filter(Boolean).join(' · '))

  return {
    template: activeTemplate,
    ratio: ratio || '16:9',
    title: heading,
    subtitle,
    oneLiner: copy?.oneLiner || project?.description || '',
    body: copy?.body || '',
    highlights,
    metrics,
    tags,
    techStack: copy?.techStack || [],
    audience: copy?.audience || [],
    accent: previous?.accent || meta?.defaultAccent || '#B4542F',
    background: previous?.background || meta?.defaultBackground || '#F4F1E9',
    font: previous?.font || (activeTemplate === 'terminal' ? 'mono' : 'sans'),
    titleScale: previous?.titleScale ?? 1,
    showHighlights: true,
    showMetrics: true,
    showTags: true,
    showFooter: true,
    footer: DEFAULT_FOOTER,
    badge: '',
    imageId: null,
    imageZoom: 1,
    imageOffsetX: 0,
    imageOffsetY: 0,
    imageTreatment: 'top',
    imageCorner: 12,
    texture: 0.4,
  }
}

/** 切换模板时：沿用已有文案，但套用模板的默认配色（用户自定义过的颜色保留） */
export function switchTemplate(design: DesignState, template: TemplateId, keepColors: boolean): DesignState {
  const meta = TEMPLATE_MAP[template]
  if (!meta) return design
  const nextFont = template === 'terminal' ? 'mono' : template === 'editorial' ? 'serif' : design.font
  return {
    ...design,
    template,
    font: template === 'terminal' || template === 'editorial' ? nextFont : design.font,
    accent: keepColors ? design.accent : meta.defaultAccent,
    background: keepColors ? design.background : meta.defaultBackground,
  }
}

export function designFingerprint(design: DesignState): string {
  return JSON.stringify(design)
}
