import { describe, expect, it, vi } from 'vitest'

import { resolveToken } from '../../src/auth.js'
import {
  isSupportedManifest,
  parsePackageJson,
  parseRequirementsTxt,
} from '../../src/manifest.js'
import {
  diagnosticMessage,
  hoverMarkdown,
  normaliseVerdict,
  severityFor,
  shouldReport,
} from '../../src/severity.js'
import { Verifier } from '../../src/verifier.js'

describe('manifest parsing', () => {
  it('reads dependencies and devDependencies from package.json', () => {
    const text = JSON.stringify(
      {
        dependencies: { express: '^4.18.2', '@scope/pkg': '2.0.0' },
        devDependencies: { vitest: '~2.1.8' },
      },
      null,
      2,
    )
    const purls = parsePackageJson(text).map(dep => dep.purl)

    expect(purls).toContain('pkg:npm/express@4.18.2')
    expect(purls).toContain('pkg:npm/%40scope/pkg@2.0.0')
    expect(purls).toContain('pkg:npm/vitest@2.1.8')
  })

  it('records the line each dependency appears on', () => {
    const text = ['{', '  "dependencies": {', '    "express": "^4.18.2"', '  }', '}'].join('\n')
    expect(parsePackageJson(text)[0]?.line).toBe(2)
  })

  it('survives malformed json without throwing', () => {
    expect(parsePackageJson('{ not json')).toEqual([])
  })

  it('reads pinned requirements and ignores comments and flags', () => {
    const purls = parseRequirementsTxt(
      ['# comment', 'requests==2.32.3', '-r other.txt', 'Flask==3.0.0'].join('\n'),
    ).map(dep => dep.purl)

    expect(purls).toEqual(['pkg:pypi/requests@2.32.3', 'pkg:pypi/flask@3.0.0'])
  })

  it('recognises only supported manifests', () => {
    expect(isSupportedManifest('/repo/package.json')).toBe(true)
    expect(isSupportedManifest('/repo/requirements.txt')).toBe(true)
    expect(isSupportedManifest('/repo/README.md')).toBe(false)
  })
})

describe('policy level', () => {
  it('lenient reports only blocks', () => {
    expect(shouldReport('BLOCK', 'lenient')).toBe(true)
    expect(shouldReport('WARN', 'lenient')).toBe(false)
    expect(shouldReport('ALLOW', 'lenient')).toBe(false)
  })

  it('moderate adds warnings', () => {
    expect(shouldReport('WARN', 'moderate')).toBe(true)
    expect(shouldReport('ALLOW', 'moderate')).toBe(false)
  })

  it('strict reports everything', () => {
    expect(shouldReport('ALLOW', 'strict')).toBe(true)
  })

  it('maps verdicts to severities', () => {
    expect(severityFor('BLOCK')).toBe('error')
    expect(severityFor('WARN')).toBe('warning')
    expect(severityFor('ALLOW')).toBe('information')
  })

  it('normalises unknown verdicts to allow rather than throwing', () => {
    expect(normaliseVerdict(undefined)).toBe('ALLOW')
    expect(normaliseVerdict('block')).toBe('BLOCK')
  })
})

describe('messages', () => {
  const summary = {
    artifact: 'pkg:npm/express@4.18.2',
    verdict: 'WARN',
    risk_score: 42,
    provenance: 'verified',
    findings: [{ title: 'Deprecated package', severity: 'medium' }],
  }

  it('leads a diagnostic with the verdict', () => {
    expect(diagnosticMessage(summary).startsWith('Phylax WARN')).toBe(true)
  })

  it('includes findings in the hover', () => {
    const markdown = hoverMarkdown(summary)
    expect(markdown).toContain('Deprecated package')
    expect(markdown).toContain('42/100')
  })
})

describe('token resolution', () => {
  it('prefers the environment', async () => {
    const source = await resolveToken({ env: { PHYLAX_API_TOKEN: 'env-token' } })
    expect(source).toEqual({ token: 'env-token', origin: 'environment' })
  })

  it('falls back to settings', async () => {
    const source = await resolveToken({ env: {}, settingsToken: 'settings-token' })
    expect(source?.origin).toBe('settings')
  })

  it('falls back to the CLI session so there is one login, not two', async () => {
    const source = await resolveToken({
      env: {},
      readFileImpl: async () => JSON.stringify({ token: 'cli-token' }),
    })
    expect(source).toEqual({ token: 'cli-token', origin: 'cli-session' })
  })

  it('returns undefined when nothing is available', async () => {
    const source = await resolveToken({
      env: {},
      readFileImpl: async () => {
        throw new Error('missing')
      },
    })
    expect(source).toBeUndefined()
  })
})

describe('verifier', () => {
  function verifierWith(response: unknown, status = 200) {
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify(response), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
    )
    return {
      fetchImpl,
      verifier: new Verifier({ apiToken: 'phx_live_test', fetch: fetchImpl as never }),
    }
  }

  const deps = [
    { name: 'express', range: '^4.18.2', purl: 'pkg:npm/express@4.18.2', line: 1 },
    { name: 'left-pad', range: '^1.3.0', purl: 'pkg:npm/left-pad@1.3.0', line: 2 },
  ]

  it('verifies a manifest in a single batched request', async () => {
    const { fetchImpl, verifier } = verifierWith([
      { artifact: 'pkg:npm/express@4.18.2', verdict: 'ALLOW' },
      { artifact: 'pkg:npm/left-pad@1.3.0', verdict: 'WARN' },
    ])

    const outcome = await verifier.verify(deps)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(outcome.summaries).toHaveLength(2)
  })

  it('caches so a re-scan does not re-request', async () => {
    const { fetchImpl, verifier } = verifierWith([
      { artifact: 'pkg:npm/express@4.18.2', verdict: 'ALLOW' },
      { artifact: 'pkg:npm/left-pad@1.3.0', verdict: 'WARN' },
    ])

    await verifier.verify(deps)
    await verifier.verify(deps)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('surfaces an API failure rather than throwing into the editor', async () => {
    const { verifier } = verifierWith({ detail: 'nope' }, 402)
    const outcome = await verifier.verify(deps)

    expect(outcome.summaries).toEqual([])
    expect(outcome.error).toMatch(/plan_required/)
  })

  it('counts blocked dependencies for the status bar', async () => {
    const { verifier } = verifierWith([
      { artifact: 'pkg:npm/express@4.18.2', verdict: 'ALLOW' },
      { artifact: 'pkg:npm/left-pad@1.3.0', verdict: 'BLOCK' },
    ])

    await verifier.verify(deps)
    expect(verifier.blockedCount()).toBe(1)
  })
})
