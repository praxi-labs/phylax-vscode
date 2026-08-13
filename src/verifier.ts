import { PhylaxSdk } from '@phyi/sdk'

import type { DependencyRef } from './manifest.js'
import { normaliseVerdict, type VerdictSummary } from './severity.js'

export interface VerifierOptions {
  apiToken: string
  baseUrl?: string | undefined
  policy?: string | undefined
  fetch?: typeof globalThis.fetch | undefined
}

export interface VerificationOutcome {
  summaries: VerdictSummary[]
  error: string | undefined
}

export class Verifier {
  readonly #sdk: PhylaxSdk
  readonly #policy: string | undefined
  readonly #cache = new Map<string, VerdictSummary>()

  constructor(options: VerifierOptions) {
    this.#sdk = new PhylaxSdk({
      apiToken: options.apiToken,
      baseUrl: options.baseUrl,
      userAgent: 'phylax-vscode/0.1.0',
      fetch: options.fetch,
    })
    this.#policy = options.policy
  }

  async verify(dependencies: DependencyRef[]): Promise<VerificationOutcome> {
    const pending = dependencies.filter(dep => !this.#cache.has(dep.purl))
    const uniquePurls = [...new Set(pending.map(dep => dep.purl))]

    if (uniquePurls.length > 0) {
      const response = await this.#sdk.artifacts.verifyMany(uniquePurls, {
        ...(this.#policy ? { policy: this.#policy } : {}),
      })

      if (!response.success) {
        return {
          summaries: [],
          error: `${response.code}: ${response.error}`,
        }
      }

      const rows = Array.isArray(response.data) ? response.data : [response.data]
      for (const row of rows) {
        const summary = row as unknown as VerdictSummary
        if (summary?.artifact) {
          this.#cache.set(summary.artifact, summary)
        }
      }
    }

    const summaries = dependencies
      .map(dep => this.#cache.get(dep.purl))
      .filter((value): value is VerdictSummary => value !== undefined)

    return { summaries, error: undefined }
  }

  summaryFor(purl: string): VerdictSummary | undefined {
    return this.#cache.get(purl)
  }

  blockedCount(): number {
    let blocked = 0
    for (const summary of this.#cache.values()) {
      if (normaliseVerdict(summary.verdict) === 'BLOCK') {
        blocked++
      }
    }
    return blocked
  }

  clear(): void {
    this.#cache.clear()
  }
}
