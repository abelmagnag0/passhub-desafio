// Dependencies
import { createHash } from 'node:crypto'

export class AgentHash {
  constructor(private readonly salt: string | undefined) {}

  get enabled(): boolean {
    return Boolean(this.salt)
  }

  of(ip: string | undefined): string | undefined {
    if (!ip || !this.salt) return undefined
    return createHash('sha256')
      .update(`${this.salt}:${ip}`)
      .digest('hex')
      .slice(0, 16)
  }
}