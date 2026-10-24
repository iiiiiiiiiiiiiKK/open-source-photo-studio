// 类型声明：shared/copywriter.mjs 由 Node 服务端与浏览器共用，
// 用纯 JS 编写以兼容两端，这里给出类型签名供 TypeScript 前端检查。

import type { CopyHighlight, CopyFact, CopyMetric, GeneratedCopy, ProjectInfo } from '../src/types'

export declare function generateCopy(
  project: ProjectInfo,
  options?: { tone?: string }
): GeneratedCopy

export declare function extractReadmeFeatures(markdown: string, limit?: number): string[]

export declare function aiConfig(): {
  enabled: boolean
  apiKey: string
  baseUrl: string
  model: string
}

export declare function generateCopyWithAI(project: ProjectInfo, baseCopy: GeneratedCopy): Promise<GeneratedCopy>

export declare function fmtCount(n: number | null | undefined): string | null

export type { CopyHighlight, CopyFact, CopyMetric, GeneratedCopy }
