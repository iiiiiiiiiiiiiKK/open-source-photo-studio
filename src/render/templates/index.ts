import type { TemplateContext, TemplateMeta } from './shared'
import { cardTemplate } from './card'
import { terminalTemplate } from './terminal'
import { editorialTemplate } from './editorial'
import { posterTemplate } from './poster'
import { collageTemplate } from './collage'
import { architectureTemplate } from './architecture'

export const TEMPLATES: TemplateMeta[] = [
  cardTemplate,
  terminalTemplate,
  editorialTemplate,
  posterTemplate,
  collageTemplate,
  architectureTemplate,
]

export const TEMPLATE_MAP: Record<string, TemplateMeta> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t])
)

export function getTemplate(id: string): TemplateMeta {
  return TEMPLATE_MAP[id] || cardTemplate
}

export type { TemplateContext, TemplateImages, TemplateMeta } from './shared'
