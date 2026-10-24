/** 请求层错误类型（独立文件，避免 api.ts 与 staticApi.ts 循环引用） */
export class RequestError extends Error {
  code: string
  hint: string
  status: number

  constructor(message: string, code: string, hint = '', status = 0) {
    super(message)
    this.name = 'RequestError'
    this.code = code
    this.hint = hint
    this.status = status
  }
}
