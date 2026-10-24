// 轻量并发闸门：限制截图等重任务的并发数，并在排队超时后放弃。
export class Semaphore {
  constructor(max, queueTimeoutMs = 20000) {
    this.max = max
    this.active = 0
    this.queue = []
    this.queueTimeoutMs = queueTimeoutMs
  }

  get stats() {
    return { active: this.active, queued: this.queue.length, max: this.max }
  }

  async acquire() {
    if (this.active < this.max) {
      this.active++
      return this.#releaser()
    }
    if (this.queue.length >= this.max * 4) {
      const err = new Error('当前截图任务过多，请稍后再试')
      err.code = 'BUSY'
      throw err
    }
    const entry = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.queue.indexOf(item)
        if (idx !== -1) this.queue.splice(idx, 1)
        const err = new Error('排队超时：服务器截图任务繁忙，请稍后重试')
        err.code = 'BUSY'
        reject(err)
      }, this.queueTimeoutMs)
      const item = { resolve, reject, timer }
      this.queue.push(item)
    }).then(() => {
      this.active++
      return this.#releaser()
    })
    return entry
  }

  #releaser() {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active = Math.max(0, this.active - 1)
      const next = this.queue.shift()
      if (next) {
        clearTimeout(next.timer)
        next.resolve()
      }
    }
  }
}
