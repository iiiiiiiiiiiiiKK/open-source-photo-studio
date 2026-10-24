// 类型声明：shared/github-parse.mjs 的公共签名。

import type { ProjectInfo } from '../src/types'

export declare function parseGitHubUrl(
  raw: string
): { owner: string; repo: string; fullName: string; url: string } | null

export declare function isGitHubRepoUrl(raw: string): boolean

export declare function extractReadmeImages(markdown: string, baseUrl: string): string[]

export declare function readmeToPlain(markdown: string, limit?: number): string

export declare function readmeLeadParagraphs(markdown: string, count?: number): string[]

export declare function assembleGitHubProject(
  repo: any,
  extras?: {
    languages?: Record<string, number> | null
    readme?: string | null
    release?: any
    sourceUrl?: string
  }
): ProjectInfo
