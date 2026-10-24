// 中文文案生成。
// 原则：只使用抓取到的真实资料。没有依据的内容不写；不确定的指标标记为"未知"而不是编造。
// 两种模式：
//   1) deterministic（默认，无需任何 API Key）—— 用结构化事实拼接中文句子；
//   2) ai（可选）—— 调用 OpenAI 兼容接口，把事实作为证据输入，并在结果里保留出处。

const KIND_HINTS = [
  { re: /framework|框架/i, zh: '框架' },
  { re: /library|库\b/i, zh: '开发库' },
  { re: /cli|command[- ]line|终端/i, zh: '命令行工具' },
  { re: /editor|编辑器/i, zh: '编辑器' },
  { re: /database|db\b|存储/i, zh: '数据库' },
  { re: /ui|component|组件/i, zh: 'UI 组件库' },
  { re: /template|boilerplate|starter/i, zh: '项目模板' },
  { re: /server|backend|后端|service/i, zh: '后端服务' },
  { re: /agent|llm|gpt|ai\b|模型/i, zh: 'AI 工具' },
  { re: /game|游戏/i, zh: '游戏' },
  { re: /tool|工具/i, zh: '工具' },
  { re: /plugin|extension|插件/i, zh: '插件' },
  { re: /doc|guide|手册|文档/i, zh: '文档项目' },
]

const AUDIENCE_RULES = [
  { re: /react|vue|svelte|angular|next|nuxt|前端|frontend|ui|css|tailwind/i, zh: '前端开发者' },
  { re: /node|deno|bun|server|backend|express|fastify|nestjs|后端/i, zh: '后端开发者' },
  { re: /python|pandas|numpy|torch|tensor|machine learning|深度学习|数据/i, zh: 'Python / 数据方向开发者' },
  { re: /rust|cargo|嵌入式|embedded/i, zh: 'Rust / 系统方向开发者' },
  { re: /go\b|golang/i, zh: 'Go 开发者' },
  { re: /cli|terminal|shell|命令/i, zh: '喜欢用命令行的工程师' },
  { re: /docker|kubernetes|k8s|devops|部署|deploy/i, zh: 'DevOps / 运维工程师' },
  { re: /design|designer|设计|figma/i, zh: '设计师' },
  { re: /game|3d|图形|graphics/i, zh: '图形 / 游戏开发者' },
]

const LICENSE_NOTES = {
  MIT: 'MIT 许可证，商业使用限制少',
  'Apache-2.0': 'Apache-2.0 许可证，允许商用并附带专利授权',
  'GPL-3.0': 'GPL-3.0，衍生作品需要同样开源',
  'GPL-2.0': 'GPL-2.0，衍生作品需要同样开源',
  'AGPL-3.0': 'AGPL-3.0，网络服务形式使用也需开源',
  'BSD-3-Clause': 'BSD-3-Clause 许可证',
  'BSD-2-Clause': 'BSD-2-Clause 许可证',
  ISC: 'ISC 许可证',
  'MPL-2.0': 'MPL-2.0 许可证',
  'LGPL-3.0': 'LGPL-3.0 许可证',
  Unlicense: 'Unlicense，等同于公共领域',
}

function fmtCount(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n >= 100000000) return `${(n / 100000000).toFixed(1).replace(/\.0$/, '')} 亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')} 万`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function daysSince(iso) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

function detectKind(project) {
  const hay = [project.description, project.name, ...(project.topics || []), project.language]
    .filter(Boolean)
    .join(' ')
  for (const hint of KIND_HINTS) {
    if (hint.re.test(hay)) return hint.zh
  }
  return project.source === 'github' ? '开源项目' : '产品'
}

function detectAudience(project) {
  const hay = [
    project.description,
    project.name,
    project.language,
    ...(project.topics || []),
    ...(project.languages || []).map((l) => l.name),
    project.readmeRawTruncated?.slice(0, 3000) || '',
  ]
    .filter(Boolean)
    .join(' ')
  const found = []
  for (const rule of AUDIENCE_RULES) {
    if (rule.re.test(hay) && !found.includes(rule.zh)) found.push(rule.zh)
  }
  return found.slice(0, 3)
}

function pickTopics(project, limit = 4) {
  return (project.topics || []).filter(Boolean).slice(0, limit)
}

/** 从 README 中提取 "特性/Features" 段落里的条目（这些是项目自己宣称的能力，属于有依据的内容） */
export function extractReadmeFeatures(markdown, limit = 5) {
  if (!markdown) return []
  const lines = markdown.split('\n')
  let inSection = false
  let level = 0
  const items = []
  for (const raw of lines) {
    const line = raw.trim()
    const heading = line.match(/^(#{2,4})\s*(.+)$/)
    if (heading) {
      const isFeatureHeading = /feature|highlight|what|capabilit|功能|特性|亮点|特点|优势|why/i.test(heading[2])
      if (isFeatureHeading) {
        inSection = true
        level = heading[1].length
        continue
      }
      if (inSection && heading[1].length <= level) inSection = false
      continue
    }
    if (!inSection) continue
    const bullet = line.match(/^[-*+]\s+(.+)$/)
    if (!bullet) continue
    let text = bullet[1]
    text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    text = text.replace(/\*\*|__|`/g, '')
    text = text.replace(/<[^>]+>/g, '')
    text = text.replace(/\s+/g, ' ').trim()
    // 去掉 "**Feature** — description" 形式的前缀强化
    if (text.length < 8) continue
    if (/badge|shields|license|ci\b|build status/i.test(text)) continue
    items.push(text.slice(0, 160))
    if (items.length >= limit) break
  }
  return items
}

function truncate(text, max) {
  const value = String(text || '').replace(/\s+/g, ' ').trim()
  if (value.length <= max) return value
  return `${value.slice(0, max - 1)}…`
}

/** ---------- 主生成函数（无 AI） ---------- */

export function generateCopy(project, { tone = 'product' } = {}) {
  const kind = detectKind(project)
  const isGitHub = project.source === 'github'
  const displayName = project.fullName || project.name || '未命名项目'
  const audience = detectAudience(project)
  const topics = pickTopics(project, 5)
  const facts = []
  const warnings = []

  const starText = fmtCount(project.stars)
  const language = project.language || project.languages?.[0]?.name || ''
  const licenseNote = LICENSE_NOTES[project.license] || (project.license ? `${project.license} 许可证` : '')

  // ---- 一句话介绍 ----
  let oneLiner
  if (isGitHub) {
    const parts = [`${displayName} 是一个`]
    if (language) parts.push(`以 ${language} 为主`)
    parts.push(`${kind}`)
    if (project.description) {
      parts.push(`，官方描述为「${truncate(project.description, 110)}」`)
    } else {
      parts.push('，仓库没有填写简述')
    }
    if (starText && typeof project.stars === 'number') parts.push(`，目前获得 ${starText} 个 Star`)
    oneLiner = parts.join('') + '。'
    facts.push({ label: '仓库', value: displayName, source: 'GitHub REST API /repos' })
    if (project.description) facts.push({ label: '官方简述', value: project.description, source: 'GitHub REST API description' })
    if (language) facts.push({ label: '主要语言', value: language, source: 'GitHub REST API language' })
  } else {
    const site = project.title || project.name || project.host || '该项目'
    oneLiner = project.description
      ? `${site}：${truncate(project.description, 130)}`
      : `${site} 是一个来自 ${project.host || '官网'} 的项目，官网没有提供可读取的简述。`
    facts.push({ label: '页面标题', value: project.title || project.name || '', source: 'HTML <title> / og:title' })
    if (project.description) facts.push({ label: '页面描述', value: project.description, source: '<meta name="description"> / og:description' })
  }

  // ---- 核心亮点 ----
  const highlights = []
  const fromReadme = extractReadmeFeatures(project.readmeRawTruncated || '', 3)
  for (const feature of fromReadme) {
    highlights.push({ text: truncate(feature, 90), evidence: 'README 特性列表' })
  }

  if (isGitHub) {
    if (project.languages?.length > 1) {
      const top = project.languages.slice(0, 3).map((l) => `${l.name} ${Math.round(l.percent)}%`).join(' / ')
      highlights.push({ text: `语言构成：${top}`, evidence: 'GitHub REST API /languages' })
    }
    if (typeof project.stars === 'number' && project.stars >= 1000) {
      highlights.push({
        text: `社区规模：${starText} Star${typeof project.forks === 'number' ? `、${fmtCount(project.forks)} Fork` : ''}`,
        evidence: 'GitHub REST API stargazers_count / forks_count',
      })
    }
    const pushedDays = daysSince(project.pushedAt)
    if (pushedDays !== null && pushedDays <= 45) {
      highlights.push({
        text: `仍在活跃维护：最近一次提交在 ${pushedDays <= 1 ? '24 小时内' : `${pushedDays} 天前`}`,
        evidence: 'GitHub REST API pushed_at',
      })
    }
    if (project.latestRelease?.tag) {
      highlights.push({ text: `最新发布版本 ${project.latestRelease.tag}`, evidence: 'GitHub REST API /releases/latest' })
    }
    if (topics.length) {
      highlights.push({ text: `常见标签：${topics.join('、')}`, evidence: 'GitHub REST API topics' })
    }
    if (licenseNote) highlights.push({ text: `许可协议：${licenseNote}`, evidence: 'GitHub REST API license' })
    if (project.archived) warnings.push('这个仓库已被作者归档，处于只读状态。')
  } else {
    if (project.host) highlights.push({ text: `官网：${project.host}`, evidence: '抓取页面地址' })
    if (project.repoLinks?.length) highlights.push({ text: `页面链接到 GitHub 仓库 ${project.repoLinks[0]}`, evidence: '页面中的 GitHub 链接' })
    if (project.ogImage) highlights.push({ text: '网站提供了社交分享封面图（og:image）', evidence: 'og:image 元信息' })
    const heading = project.h1
    if (heading) highlights.push({ text: `首页主张：${truncate(heading, 60)}`, evidence: 'HTML <h1>' })
  }

  if (highlights.length === 0) {
    highlights.push({
      text: '资料有限，建议补充项目说明后再发布',
      evidence: '未获取到可引用的事实',
    })
    warnings.push('没有抓到足够的公开信息，建议手动补充项目介绍。')
  }

  // ---- 正文说明 ----
  const bodyParts = []
  if (isGitHub) {
    bodyParts.push(oneLiner)
    if (project.description && project.readmeExcerpt?.length) {
      const extra = project.readmeExcerpt.find((p) => p && p.length > 30 && p !== project.description)
      if (extra) bodyParts.push(`README 的开头写道：「${truncate(extra, 150)}」`)
    }
    const stack = [
      ...(project.languages || []).slice(0, 4).map((l) => l.name),
    ].filter(Boolean)
    if (stack.length) bodyParts.push(`主要技术栈是 ${stack.join('、')}${licenseNote ? `，采用 ${project.license} 协议` : ''}。`)
    if (audience.length) bodyParts.push(`更适合 ${audience.join('、')} 上手。`)
    else bodyParts.push('适合对这个方向感兴趣的开发者阅读源码与文档。')
  } else {
    bodyParts.push(oneLiner)
    if (project.textSample && project.textSample.length > 60) {
      bodyParts.push(`页面正文摘要：「${truncate(project.textSample, 150)}」`)
    }
    bodyParts.push('以上信息来自目标网站的公开元信息，建议核对后再对外发布。')
  }
  const body = bodyParts.join(' ')

  // ---- 技术栈与适用人群 ----
  const techStack = []
  if (isGitHub) {
    for (const lang of (project.languages || []).slice(0, 5)) {
      techStack.push({ name: lang.name, note: `${Math.round(lang.percent)}%` })
    }
    for (const topic of topics.slice(0, 4)) {
      if (!techStack.some((t) => t.name.toLowerCase() === topic.toLowerCase())) {
        techStack.push({ name: topic, note: 'topic' })
      }
    }
  } else {
    if (project.themeColor) techStack.push({ name: `主题色 ${project.themeColor}`, note: 'theme-color' })
    if (project.host) techStack.push({ name: project.host, note: '站点' })
  }

  // ---- X 短文案 ----
  const tweetLines = []
  if (isGitHub) {
    tweetLines.push(`${project.name}｜${truncate(project.description || '开源项目', 80)}`)
    if (starText) tweetLines.push(`★ ${starText} · ${language || '多语言'}${project.license ? ` · ${project.license}` : ''}`)
    const first = highlights[0]?.text
    if (first) tweetLines.push(`亮点：${first}`)
    tweetLines.push(project.repoUrl || '')
  } else {
    tweetLines.push(`${project.title || project.name}`)
    if (project.description) tweetLines.push(truncate(project.description, 100))
    tweetLines.push(project.url || '')
  }
  const tweet = tweetLines.filter(Boolean).join('\n').slice(0, 280)

  // ---- 指标（缺失就标记未知，不编造） ----
  const metrics = []
  if (isGitHub) {
    metrics.push({
      key: 'stars',
      label: 'Star',
      value: typeof project.stars === 'number' ? fmtCount(project.stars) : '未知',
      raw: project.stars,
      known: typeof project.stars === 'number',
      source: 'stargazers_count',
    })
    metrics.push({
      key: 'forks',
      label: 'Fork',
      value: typeof project.forks === 'number' ? fmtCount(project.forks) : '未知',
      raw: project.forks,
      known: typeof project.forks === 'number',
      source: 'forks_count',
    })
    metrics.push({
      key: 'issues',
      label: 'Issues',
      value: typeof project.issues === 'number' ? fmtCount(project.issues) : '未知',
      raw: project.issues,
      known: typeof project.issues === 'number',
      source: 'open_issues_count',
    })
    metrics.push({
      key: 'language',
      label: '语言',
      value: language || '未知',
      known: Boolean(language),
      source: 'language',
    })
    metrics.push({
      key: 'license',
      label: '许可',
      value: project.license || '未知',
      known: Boolean(project.license),
      source: 'license',
    })
  } else {
    metrics.push({ key: 'host', label: '站点', value: project.host || '未知', known: Boolean(project.host), source: 'URL' })
    if (project.themeColor) metrics.push({ key: 'theme', label: '主题色', value: project.themeColor, known: true, source: 'theme-color' })
  }

  return {
    mode: 'deterministic',
    generatedAt: new Date().toISOString(),
    title: project.name || project.title || '未命名项目',
    subtitle: isGitHub
      ? [project.owner, language, project.license].filter(Boolean).join(' · ')
      : [project.host, project.siteName].filter(Boolean).join(' · '),
    oneLiner,
    highlights: highlights.slice(0, 5),
    body,
    audience: audience.length ? audience : ['对该方向感兴趣的开发者'],
    techStack,
    tweet,
    metrics,
    facts,
    warnings,
    tone,
  }
}

/** ---------- 可选：AI 增强 ---------- */

/** 读取环境变量；在浏览器（静态部署模式）里没有 process，安全返回空字符串 */
function readEnv(name) {
  if (typeof process !== "undefined" && process && process.env) return process.env[name] || ""
  return ""
}

export function aiConfig() {
  const apiKey = readEnv("AI_API_KEY") || readEnv("OPENAI_API_KEY")
  const baseUrl = (readEnv("AI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "")
  const model = readEnv("AI_MODEL") || "gpt-4o-mini"
  return { enabled: Boolean(apiKey), apiKey, baseUrl, model }
}

const AI_SYSTEM_PROMPT = `你是一个严谨的中文技术内容编辑，为开源项目/产品撰写展示图文案。
硬性要求：
1. 只能使用用户提供的"事实材料"里的信息，绝不编造 Star 数、作者、功能、性能数字或用户评价。
2. 材料里没有的信息必须省略，或写"未公开"，不要用推测填补。
3. 中文表达自然、具体，避免空洞的营销词（如"赋能""颠覆""一站式神器"）。
4. 只输出 JSON。`

/**
 * 调用 OpenAI 兼容接口生成中文文案。
 * 失败时抛出错误，由调用方回退到 deterministic 模式。
 */
export async function generateCopyWithAI(project, baseCopy) {
  const cfg = aiConfig()
  if (!cfg.enabled) {
    const err = new Error('服务端未配置 AI_API_KEY，已使用无需 Key 的本地文案模式')
    err.code = 'AI_DISABLED'
    throw err
  }

  const material = {
    名称: project.fullName || project.name || project.title,
    类型: project.source === 'github' ? 'GitHub 仓库' : '网站',
    官方简述: project.description || '(未提供)',
    网址: project.repoUrl || project.url,
    主要语言: project.language || '',
    语言构成: (project.languages || []).map((l) => `${l.name} ${Math.round(l.percent)}%`).join('、'),
    许可证: project.license || '(未提供)',
    Star: typeof project.stars === 'number' ? project.stars : '(未获取)',
    Fork: typeof project.forks === 'number' ? project.forks : '(未获取)',
    Topics: (project.topics || []).join('、'),
    最近更新: project.pushedAt || '',
    README开头: (project.readmeExcerpt || []).slice(0, 3),
    README特性条目: extractReadmeFeatures(project.readmeRawTruncated || '', 6),
    网站标题: project.title || '',
    网站描述: project.description || '',
  }

  const userPrompt = `请根据下面的事实材料，输出中文展示图文案。
事实材料（JSON）：
${JSON.stringify(material, null, 2)}

输出严格符合这个 JSON 结构：
{
  "oneLiner": "一句话介绍，40-70 字",
  "highlights": ["3-5 条核心亮点，每条不超过 30 字"],
  "body": "面向普通读者的中文说明，80-160 字",
  "audience": ["适用人群，1-3 个"],
  "techStack": ["技术栈关键词，0-5 个"],
  "tweet": "适合发布到 X 的短文案，不超过 200 字，可含 1-2 个 emoji"
}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 40000)
  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error(`AI 接口返回 ${res.status}：${text.slice(0, 200)}`)
      err.code = 'AI_FAILED'
      throw err
    }
    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content || ''
    const parsed = JSON.parse(content)
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights
          .filter((h) => typeof h === 'string' && h.trim())
          .slice(0, 5)
          .map((text) => ({ text: truncate(text, 90), evidence: 'AI 依据事实材料生成，发布前请核对' }))
      : baseCopy.highlights

    return {
      ...baseCopy,
      mode: 'ai',
      generatedAt: new Date().toISOString(),
      aiModel: cfg.model,
      oneLiner: truncate(parsed.oneLiner || baseCopy.oneLiner, 200),
      highlights: highlights.length ? highlights : baseCopy.highlights,
      body: truncate(parsed.body || baseCopy.body, 600),
      audience: Array.isArray(parsed.audience) && parsed.audience.length ? parsed.audience.slice(0, 3) : baseCopy.audience,
      techStack: Array.isArray(parsed.techStack) && parsed.techStack.length
        ? parsed.techStack.slice(0, 5).map((name) => ({ name: String(name), note: '' }))
        : baseCopy.techStack,
      tweet: truncate(parsed.tweet || baseCopy.tweet, 320),
    }
  } finally {
    clearTimeout(timer)
  }
}

export { fmtCount }
