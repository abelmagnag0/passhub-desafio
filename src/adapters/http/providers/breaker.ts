const FAILURE_THRESHOLD = 5
const OPEN_MS = 15_000
const HALF_OPEN_SUCCESSES = 2

type State = 'closed' | 'open' | 'half-open'

export class CircuitBreaker {
  private state: State = 'closed'
  private failures = 0
  private successes = 0
  private openedAt = 0

  canPass(): boolean {
    if (this.state === 'closed') return true
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= OPEN_MS) {
        this.state = 'half-open'
        this.successes = 0
        return true
      }
      return false
    }
    return true
  }

  onSuccess(): void {
    if (this.state === 'half-open') {
      this.successes += 1
      if (this.successes >= HALF_OPEN_SUCCESSES) this.close()
      return
    }
    this.failures = 0
  }

  onFailure(): void {
    if (this.state === 'half-open') {
      this.open()
      return
    }
    this.failures += 1
    if (this.failures >= FAILURE_THRESHOLD) this.open()
  }

  get currentState(): State {
    return this.state
  }

  private open(): void {
    this.state = 'open'
    this.openedAt = Date.now()
    this.failures = 0
  }

  private close(): void {
    this.state = 'closed'
    this.failures = 0
    this.successes = 0
  }
}
