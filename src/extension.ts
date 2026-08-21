import * as vscode from 'vscode'

import { resolveToken } from './auth.js'
import { isSupportedManifest, parseManifest } from './manifest.js'
import {
  diagnosticMessage,
  hoverMarkdown,
  isUncovered,
  normaliseVerdict,
  severityFor,
  shouldReport,
  type PolicyLevel,
} from './severity.js'
import { Verifier } from './verifier.js'

const SEVERITY_MAP: Record<string, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
}

let diagnostics: vscode.DiagnosticCollection
let verifier: Verifier | undefined
let status: vscode.StatusBarItem

function config() {
  return vscode.workspace.getConfiguration('phylax')
}

async function ensureVerifier(): Promise<Verifier | undefined> {
  if (verifier) {
    return verifier
  }

  const source = await resolveToken()
  if (!source) {
    return undefined
  }

  verifier = new Verifier({
    apiToken: source.token,
    baseUrl: config().get<string>('baseUrl') || undefined,
    policy: config().get<string>('policy') || undefined,
  })

  return verifier
}

async function scanDocument(document: vscode.TextDocument): Promise<void> {
  if (!config().get<boolean>('enable')) {
    return
  }
  if (!isSupportedManifest(document.fileName)) {
    return
  }

  const dependencies = parseManifest(document.fileName, document.getText())
  if (dependencies.length === 0) {
    diagnostics.set(document.uri, [])
    return
  }

  const active = await ensureVerifier()
  if (!active) {
    status.text = '$(shield) Phylax: sign in'
    status.show()
    return
  }

  const level = (config().get<string>('policyLevel') ?? 'moderate') as PolicyLevel
  const outcome = await active.verify(dependencies)

  if (outcome.error) {
    status.text = `$(shield) Phylax: ${outcome.error}`
    status.show()
    return
  }

  const entries: vscode.Diagnostic[] = []

  for (const dependency of dependencies) {
    const summary = active.summaryFor(dependency.purl)
    if (!summary) {
      continue
    }

    const uncovered = isUncovered(summary)
    const verdict = normaliseVerdict(summary.verdict)
    if (uncovered ? level !== 'strict' : !shouldReport(verdict, level)) {
      continue
    }

    const line = document.lineAt(Math.min(dependency.line, document.lineCount - 1))
    const diagnostic = new vscode.Diagnostic(
      line.range,
      diagnosticMessage(summary),
      uncovered
        ? vscode.DiagnosticSeverity.Information
        : SEVERITY_MAP[severityFor(verdict)] ?? vscode.DiagnosticSeverity.Information,
    )
    diagnostic.source = 'Phylax'
    entries.push(diagnostic)
  }

  diagnostics.set(document.uri, entries)

  const blocked = active.blockedCount()
  status.text = blocked > 0 ? `$(shield) Phylax: ${blocked} blocked` : '$(shield) Phylax'
  status.show()
}

export function activate(context: vscode.ExtensionContext): void {
  diagnostics = vscode.languages.createDiagnosticCollection('phylax')
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  context.subscriptions.push(diagnostics, status)

  context.subscriptions.push(
    vscode.commands.registerCommand('phylax.signIn', async () => {
      const token = await vscode.window.showInputBox({
        prompt: 'Phylax API token',
        password: true,
        ignoreFocusOut: true,
      })
      if (!token) {
        return
      }
      await config().update('token', token, vscode.ConfigurationTarget.Global)
      verifier = undefined
      void vscode.window.showInformationMessage('Phylax token saved.')
    }),

    vscode.commands.registerCommand('phylax.scanWorkspace', async () => {
      for (const document of vscode.workspace.textDocuments) {
        await scanDocument(document)
      }
    }),

    vscode.commands.registerCommand('phylax.clearDiagnostics', () => {
      diagnostics.clear()
      verifier?.clear()
    }),
  )

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(document => {
      if (config().get<boolean>('scanOnOpen')) {
        void scanDocument(document)
      }
    }),

    vscode.workspace.onDidSaveTextDocument(document => {
      if (config().get<boolean>('autoUpdate')) {
        void scanDocument(document)
      }
    }),

    vscode.languages.registerHoverProvider(
      [{ pattern: '**/package.json' }, { pattern: '**/requirements.txt' }],
      {
        provideHover(document, position) {
          if (!config().get<boolean>('showInlineResults') || !verifier) {
            return undefined
          }
          const dependencies = parseManifest(document.fileName, document.getText())
          const match = dependencies.find(dep => dep.line === position.line)
          if (!match) {
            return undefined
          }
          const summary = verifier.summaryFor(match.purl)
          return summary
            ? new vscode.Hover(new vscode.MarkdownString(hoverMarkdown(summary)))
            : undefined
        },
      },
    ),
  )

  if (config().get<boolean>('scanOnOpen')) {
    for (const document of vscode.workspace.textDocuments) {
      void scanDocument(document)
    }
  }
}

export function deactivate(): void {
  diagnostics?.dispose()
  status?.dispose()
}
