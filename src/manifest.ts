export interface DependencyRef {
  name: string
  range: string
  purl: string
  line: number
}

export type Ecosystem = 'npm' | 'pypi'

function toPurl(ecosystem: Ecosystem, name: string, version: string): string {
  const cleaned = version.replace(/^[\^~>=<\s]+/, '').trim()
  const encoded =
    ecosystem === 'npm' && name.startsWith('@')
      ? `${encodeURIComponent(name.split('/')[0] ?? '')}/${name.split('/')[1] ?? ''}`
      : name
  return `pkg:${ecosystem}/${encoded}@${cleaned}`
}

export function parsePackageJson(text: string): DependencyRef[] {
  let parsed: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }

  const lines = text.split(/\r?\n/)
  const found: DependencyRef[] = []

  const sections = [parsed.dependencies, parsed.devDependencies]

  for (const section of sections) {
    if (!section) {
      continue
    }
    for (const [name, range] of Object.entries(section)) {
      if (typeof range !== 'string') {
        continue
      }
      const needle = `"${name}"`
      const line = lines.findIndex(candidate => candidate.includes(needle))
      found.push({
        name,
        range,
        purl: toPurl('npm', name, range),
        line: line === -1 ? 0 : line,
      })
    }
  }

  return found
}

export function parseRequirementsTxt(text: string): DependencyRef[] {
  const found: DependencyRef[] = []
  const lines = text.split(/\r?\n/)

  lines.forEach((rawLine, index) => {
    const line = rawLine.split('#')[0]?.trim() ?? ''
    if (!line || line.startsWith('-')) {
      return
    }
    const match = /^([A-Za-z0-9._-]+)\s*(==|>=|~=)\s*([^\s;]+)/.exec(line)
    if (match?.[1] && match[3]) {
      found.push({
        name: match[1],
        range: `${match[2]}${match[3]}`,
        purl: toPurl('pypi', match[1].toLowerCase(), match[3]),
        line: index,
      })
    }
  })

  return found
}

export function parseManifest(fileName: string, text: string): DependencyRef[] {
  if (fileName.endsWith('package.json')) {
    return parsePackageJson(text)
  }
  if (fileName.endsWith('requirements.txt')) {
    return parseRequirementsTxt(text)
  }
  return []
}

export function isSupportedManifest(fileName: string): boolean {
  return fileName.endsWith('package.json') || fileName.endsWith('requirements.txt')
}
