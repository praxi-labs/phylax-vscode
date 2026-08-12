import { homedir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'

export interface TokenSource {
  token: string
  origin: 'environment' | 'cli-session' | 'settings'
}

export interface TokenLookupDeps {
  env?: NodeJS.ProcessEnv
  readFileImpl?: (path: string) => Promise<string>
  settingsToken?: string | undefined
  home?: string
}

export function cliSessionPath(home: string = homedir()): string {
  return join(home, '.phylax', 'credentials.json')
}

export async function resolveToken(
  deps: TokenLookupDeps = {},
): Promise<TokenSource | undefined> {
  const env = deps.env ?? process.env

  const fromEnv = (env['PHYLAX_API_TOKEN'] || env['PHYLAX_API_KEY'] || '').trim()
  if (fromEnv) {
    return { token: fromEnv, origin: 'environment' }
  }

  const fromSettings = (deps.settingsToken ?? '').trim()
  if (fromSettings) {
    return { token: fromSettings, origin: 'settings' }
  }

  const read = deps.readFileImpl ?? ((path: string) => readFile(path, 'utf8'))

  try {
    const raw = await read(cliSessionPath(deps.home))
    const parsed = JSON.parse(raw) as { token?: string; api_token?: string }
    const token = (parsed.token ?? parsed.api_token ?? '').trim()
    if (token) {
      return { token, origin: 'cli-session' }
    }
  } catch {
    return undefined
  }

  return undefined
}
