export type PolicyLevel = 'lenient' | 'moderate' | 'strict'
export type Verdict = 'ALLOW' | 'WARN' | 'BLOCK'

export type DiagnosticSeverity = 'error' | 'warning' | 'information'

export interface VerdictSummary {
  artifact: string
  verdict: string
  risk_score?: number
  provenance?: string
  findings?: Array<{ title?: string; severity?: string }>
  [key: string]: unknown
}

export function isUncovered(summary: VerdictSummary): boolean {
  return String(summary.coverage ?? '') === 'none'
}

export function normaliseVerdict(value: unknown): Verdict {
  const text = String(value ?? '').toUpperCase()
  if (text === 'BLOCK') {
    return 'BLOCK'
  }
  if (text === 'WARN') {
    return 'WARN'
  }
  return 'ALLOW'
}

export function shouldReport(verdict: Verdict, level: PolicyLevel): boolean {
  if (level === 'strict') {
    return true
  }
  if (level === 'moderate') {
    return verdict !== 'ALLOW'
  }
  return verdict === 'BLOCK'
}

export function severityFor(verdict: Verdict): DiagnosticSeverity {
  if (verdict === 'BLOCK') {
    return 'error'
  }
  if (verdict === 'WARN') {
    return 'warning'
  }
  return 'information'
}

export function diagnosticMessage(summary: VerdictSummary): string {
  if (isUncovered(summary)) {
    return `Phylax: ${summary.artifact} has not been evaluated by the network`
  }
  const verdict = normaliseVerdict(summary.verdict)
  const parts = [`Phylax ${verdict}: ${summary.artifact}`]

  if (typeof summary.risk_score === 'number') {
    parts.push(`risk ${summary.risk_score}/100`)
  }

  const findings = summary.findings ?? []
  if (findings.length > 0) {
    parts.push(findings[0]?.title ?? `${findings.length} findings`)
  }

  return parts.join(' | ')
}

export function hoverMarkdown(summary: VerdictSummary): string {
  const verdict = normaliseVerdict(summary.verdict)
  const lines = [`**Phylax ${verdict}**`, '', `\`${summary.artifact}\``, '']

  if (typeof summary.risk_score === 'number') {
    lines.push(`Risk score: ${summary.risk_score}/100`)
  }
  if (summary.provenance) {
    lines.push(`Provenance: ${summary.provenance}`)
  }

  const findings = summary.findings ?? []
  if (findings.length > 0) {
    lines.push('', '**Findings**')
    for (const finding of findings.slice(0, 5)) {
      lines.push(`- ${(finding.severity ?? 'unknown').toUpperCase()}: ${finding.title ?? 'unnamed'}`)
    }
  }

  return lines.join('\n')
}
