export class SharedError extends Error {
  constructor(message: string, readonly status = 503) { super(message) }
}
