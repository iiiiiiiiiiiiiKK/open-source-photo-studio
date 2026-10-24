// 安全 HTTP 客户端：DNS 解析 + IP 校验 + 固定连接 IP（防 DNS rebinding）
// + 限制跳转次数 / 响应大小 / 超时。
import http from 'node:http'
import https from 'node:https'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { resolveSafeHost, UrlGuardError, assertUrlSafe } from './url-guard.mjs'

export class HttpError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'HttpError'
    this.code = code || 'HTTP_ERROR'
    this.status = status || 0
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OpenSourcePhotoStudio/1.0'

/** 单次请求（不跟随跳转），把主机名钉到已验证的 IP 上 */
function requestOnce(url, { method = 'GET', headers = {}, address, family, timeoutMs = 15000, maxBytes = 4 * 1024 * 1024 }) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:'
    const mod = isHttps ? https : http
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const opts = {
      method,
      protocol: url.protocol,
      hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'user-agent': UA,
        accept: '*/*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'accept-encoding': 'gzip, deflate, br',
        ...headers,
      },
      servername: isHttps ? hostname : undefined,
    }
    if (address) {
      // Node 18.13+ 的 autoSelectFamily 会以 { all: true } 调用 lookup，此时必须返回数组，
      // 否则 http 会抛出 "Invalid IP address: undefined"。两种情况都要支持。
      opts.lookup = (host, options, cb) => {
        if (typeof options === 'function') {
          cb = options
          options = {}
        }
        if (options && options.all) {
          cb(null, [{ address, family: family || 4 }])
          return
        }
        cb(null, address, family || 4)
      }
      opts.autoSelectFamily = false
    }
    const req = mod.request(opts, (res) => {
      const encoding = String(res.headers['content-encoding'] || '').toLowerCase()
      let stream = res
      if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip())
      else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate())
      else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress())

      const chunks = []
      let size = 0
      let settled = false
      const fail = (err) => {
        if (settled) return
        settled = true
        stream.destroy()
        req.destroy()
        reject(err)
      }
      stream.on('data', (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
          fail(new HttpError(`响应超过大小上限（${Math.round(maxBytes / 1024)} KB）`, 'TOO_LARGE'))
          return
        }
        chunks.push(chunk)
      })
      stream.on('end', () => {
        if (settled) return
        settled = true
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      })
      stream.on('error', (err) => fail(new HttpError(`读取响应失败：${err.message}`, 'READ_FAILED')))
      res.on('error', (err) => fail(new HttpError(`连接中断：${err.message}`, 'READ_FAILED')))
    })
    req.setTimeout(timeoutMs, () => {
      req.destroy(new HttpError('请求超时', 'TIMEOUT'))
    })
    req.on('error', (err) => {
      if (err instanceof HttpError) reject(err)
      else reject(new HttpError(`网络请求失败：${err.message}`, 'NETWORK_ERROR'))
    })
    req.end()
  })
}

/**
 * 安全 GET：手动跟随跳转，每一跳都做 DNS + IP 校验。
 * 返回 { status, headers, body: Buffer, finalUrl, hops }
 */
export async function safeFetch(rawUrl, options = {}) {
  const {
    maxRedirects = 4,
    timeoutMs = 15000,
    maxBytes = 4 * 1024 * 1024,
    headers = {},
    method = 'GET',
  } = options
  let currentUrl = rawUrl
  const hops = []
  for (let i = 0; i <= maxRedirects; i++) {
    const { url, address, family } = await resolveSafeHost(currentUrl)
    hops.push(url.href)
    const res = await requestOnce(url, { method, headers, address, family, timeoutMs, maxBytes })
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      const next = new URL(res.headers.location, url)
      // 再次校验协议和主机
      assertUrlSafe(next.href)
      currentUrl = next.href
      continue
    }
    return {
      status: res.status,
      headers: res.headers,
      body: res.body,
      finalUrl: url.href,
      hops,
    }
  }
  throw new HttpError(`跳转次数超过 ${maxRedirects} 次，已停止访问`, 'TOO_MANY_REDIRECTS')
}

/** 安全 GET，返回文本（自动按 charset 解码，默认 utf-8） */
export async function fetchText(rawUrl, options = {}) {
  const res = await safeFetch(rawUrl, options)
  const contentType = String(res.headers['content-type'] || '')
  const match = contentType.match(/charset=([\w-]+)/i)
  const charset = (match?.[1] || 'utf-8').toLowerCase()
  let text
  try {
    text = new TextDecoder(charset === 'gbk' || charset === 'gb2312' ? 'gbk' : charset).decode(res.body)
  } catch {
    text = res.body.toString('utf8')
  }
  return { text, status: res.status, headers: res.headers, finalUrl: res.finalUrl }
}

/** 安全 GET，返回 JSON（带状态码检查） */
export async function fetchJson(rawUrl, options = {}) {
  const res = await safeFetch(rawUrl, options)
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(`上游返回 ${res.status}`, 'UPSTREAM_STATUS', res.status)
  }
  try {
    return { data: JSON.parse(res.body.toString('utf8')), headers: res.headers, status: res.status }
  } catch {
    throw new HttpError('上游返回的内容不是合法 JSON', 'BAD_JSON', res.status)
  }
}

export { UrlGuardError }
