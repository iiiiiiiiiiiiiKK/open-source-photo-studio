// URL / IP 安全校验：所有出站请求（元信息抓取、图片代理、网页截图）都必须经过这里。
// 目标：阻止 SSRF —— localhost、内网、链路本地、云元数据地址、非 HTTP(S) 协议、file:// 等。
import dns from 'node:dns/promises'
import net from 'node:net'

export class UrlGuardError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'UrlGuardError'
    this.code = code || 'URL_BLOCKED'
  }
}

/** 明确禁止的主机名（不区分大小写，支持后缀匹配） */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'instance-data.ec2.internal',
])

const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.localdomain',
  '.internal',
  '.intranet',
  '.corp',
  '.home',
  '.lan',
  '.private',
  '.ec2.internal',
  '.compute.internal',
]

export const DEFAULT_PORTS = { 'http:': 80, 'https:': 443 }

/** 解析 IPv4 为 32 位整数 */
function ipv4ToInt(ip) {
  const parts = ip.split('.').map((p) => Number(p))
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]
}

const IPV4_BLOCKED_RANGES = [
  ['0.0.0.0', 8, '保留地址 0.0.0.0/8'],
  ['10.0.0.0', 8, '内网 10.0.0.0/8'],
  ['100.64.0.0', 10, '运营商级 NAT 100.64.0.0/10'],
  ['127.0.0.0', 8, '回环 127.0.0.0/8'],
  ['169.254.0.0', 16, '链路本地 169.254.0.0/16（含云元数据 169.254.169.254）'],
  ['172.16.0.0', 12, '内网 172.16.0.0/12'],
  ['192.0.0.0', 24, '保留 192.0.0.0/24'],
  ['192.0.2.0', 24, '文档地址 192.0.2.0/24'],
  ['192.88.99.0', 24, '中继 192.88.99.0/24'],
  ['192.168.0.0', 16, '内网 192.168.0.0/16'],
  ['198.18.0.0', 15, '测试网 198.18.0.0/15'],
  ['198.51.100.0', 24, '文档地址 198.51.100.0/24'],
  ['203.0.113.0', 24, '文档地址 203.0.113.0/24'],
  ['224.0.0.0', 4, '组播 224.0.0.0/4'],
  ['240.0.0.0', 4, '保留 240.0.0.0/4'],
].map(([base, bits, label]) => {
  const baseInt = ipv4ToInt(base)
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return { baseInt, mask, label }
})

/** 检查 IPv4 是否属于禁止访问的地址段，返回原因或 null */
export function checkIPv4(ip) {
  const value = ipv4ToInt(ip)
  if (value === null) return 'IPv4 地址格式无效'
  for (const range of IPV4_BLOCKED_RANGES) {
    if (((value & range.mask) >>> 0) === range.baseInt) return range.label
  }
  return null
}

/** 展开 IPv6 为 8 组 16 位整数 */
function expandIPv6(ip) {
  let addr = ip.trim()
  if (addr.startsWith('[') && addr.endsWith(']')) addr = addr.slice(1, -1)
  const zoneIndex = addr.indexOf('%')
  if (zoneIndex !== -1) addr = addr.slice(0, zoneIndex)
  if (addr.includes('.')) {
    // 内嵌 IPv4，例如 ::ffff:127.0.0.1
    const lastColon = addr.lastIndexOf(':')
    const v4 = addr.slice(lastColon + 1)
    const v4Int = ipv4ToInt(v4)
    if (v4Int === null) return null
    const hi = (v4Int >>> 16).toString(16)
    const lo = (v4Int & 0xffff).toString(16)
    addr = addr.slice(0, lastColon + 1) + hi + ':' + lo
  }
  const [head, tail] = addr.split('::')
  const headParts = head ? head.split(':').filter((p) => p !== '') : []
  const tailParts = tail !== undefined && tail ? tail.split(':').filter((p) => p !== '') : []
  if (tail === undefined) {
    if (headParts.length !== 8) return null
    return headParts.map((p) => parseInt(p, 16))
  }
  const missing = 8 - headParts.length - tailParts.length
  if (missing < 0) return null
  return [
    ...headParts.map((p) => parseInt(p, 16)),
    ...new Array(missing).fill(0),
    ...tailParts.map((p) => parseInt(p, 16)),
  ].map((n) => (Number.isFinite(n) ? n : NaN))
}

const IPV6_BLOCKED_PREFIXES = [
  [[0, 0, 0, 0, 0, 0, 0, 0], 128, '未指定地址 ::'],
  [[0, 0, 0, 0, 0, 0, 0, 1], 128, '回环 ::1'],
  [[0xfc00, 0, 0, 0, 0, 0, 0, 0], 7, '唯一本地地址 fc00::/7'],
  [[0xfe80, 0, 0, 0, 0, 0, 0, 0], 10, '链路本地 fe80::/10'],
  [[0xfec0, 0, 0, 0, 0, 0, 0, 0], 10, '站点本地 fec0::/10'],
  [[0xff00, 0, 0, 0, 0, 0, 0, 0], 8, '组播 ff00::/8'],
  [[0x2001, 0x0db8, 0, 0, 0, 0, 0, 0], 32, '文档地址 2001:db8::/32'],
  [[0x0100, 0, 0, 0, 0, 0, 0, 0], 64, '丢弃前缀 100::/64'],
  [[0x2002, 0, 0, 0, 0, 0, 0, 0], 16, '6to4 2002::/16'],
  [[0x64, 0xff9b, 0, 0, 0, 0, 0, 0], 96, 'NAT64 64:ff9b::/96'],
]

function matchesIPv6Prefix(groups, prefix) {
  const { base, bits } = prefix
  let remaining = bits
  for (let i = 0; i < 8 && remaining > 0; i++) {
    const take = Math.min(16, remaining)
    const mask = (0xffff << (16 - take)) & 0xffff
    if ((groups[i] & mask) !== (base[i] & mask)) return false
    remaining -= take
  }
  return true
}

/** 检查 IPv6 是否属于禁止访问的地址段，返回原因或 null */
export function checkIPv6(ip) {
  const groups = expandIPv6(ip)
  if (!groups || groups.length !== 8 || groups.some((n) => Number.isNaN(n))) return 'IPv6 地址格式无效'
  for (const [base, bits, label] of IPV6_BLOCKED_PREFIXES) {
    if (matchesIPv6Prefix(groups, { base, bits })) return label
  }
  // IPv4 映射 / 兼容地址：::ffff:a.b.c.d
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && (groups[5] === 0xffff || groups[5] === 0)
  if (isMapped) {
    const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`
    const reason = checkIPv4(v4)
    if (reason) return `IPv4 映射地址 ${v4}：${reason}`
  }
  return null
}

/** 检查任意 IP 字面量，返回被禁止的原因或 null */
export function checkIpAddress(ip) {
  const version = net.isIP(ip)
  if (version === 4) return checkIPv4(ip)
  if (version === 6) return checkIPv6(ip)
  return '不是合法的 IP 地址'
}

export function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return '主机名为空'
  if (BLOCKED_HOSTNAMES.has(host)) return `禁止访问的主机名：${host}`
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return `禁止访问的本地/内网域名：${host}`
  }
  return null
}

/**
 * 校验 URL 的协议与主机名，返回解析后的 URL。
 * 开启 allowPrivate 仅用于单元测试（默认关闭）。
 */
export function assertUrlSafe(rawUrl) {
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new UrlGuardError('网址格式不正确，请检查后重试', 'URL_INVALID')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlGuardError(`只支持 http/https 协议，收到的是 ${url.protocol}`, 'PROTOCOL_BLOCKED')
  }
  if (url.username || url.password) {
    throw new UrlGuardError('网址中不允许包含用户名或密码', 'CREDENTIALS_BLOCKED')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  const hostReason = isBlockedHostname(hostname)
  if (hostReason) throw new UrlGuardError(hostReason, 'HOST_BLOCKED')
  if (net.isIP(hostname)) {
    const ipReason = checkIpAddress(hostname)
    if (ipReason) throw new UrlGuardError(`禁止访问的 IP 地址（${ipReason}）`, 'IP_BLOCKED')
  }
  const port = url.port ? Number(url.port) : DEFAULT_PORTS[url.protocol]
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new UrlGuardError('端口号不合法', 'PORT_BLOCKED')
  }
  return url
}

/**
 * 解析主机名并校验全部 IP。返回用于固定连接的方案：
 * { url, address, family, addresses }
 * 固定 IP 可防止 DNS rebinding（解析后重新指向内网）。
 */
export async function resolveSafeHost(rawUrl) {
  const url = assertUrlSafe(rawUrl)
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(hostname)) {
    return { url, address: hostname, family: net.isIP(hostname), addresses: [hostname] }
  }
  let records
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    throw new UrlGuardError(`域名解析失败：${hostname}`, 'DNS_FAILED')
  }
  if (!records.length) throw new UrlGuardError(`域名解析失败：${hostname}`, 'DNS_FAILED')
  for (const record of records) {
    const reason = checkIpAddress(record.address)
    if (reason) {
      throw new UrlGuardError(`域名 ${hostname} 解析到禁止访问的地址（${record.address}：${reason}）`, 'IP_BLOCKED')
    }
  }
  return { url, address: records[0].address, family: records[0].family, addresses: records.map((r) => r.address) }
}

/** 给前端用的可读错误码 */
export function describeGuardError(error) {
  if (error instanceof UrlGuardError) return { code: error.code, message: error.message }
  return { code: 'FETCH_FAILED', message: error?.message || '访问失败' }
}
