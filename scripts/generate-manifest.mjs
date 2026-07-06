import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const repo = {
  owner: 'oliver556',
  name: 'clash-rules',
  branch: 'main',
}

const rootDir = process.cwd()
const rawBase = `https://raw.githubusercontent.com/${repo.owner}/${repo.name}/${repo.branch}`

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
      continue
    }
    files.push(fullPath)
  }

  return files
}

function toRepoPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/')
}

function getPathParts(sourcePath) {
  return sourcePath.split('/').filter(Boolean)
}

function getClient(sourcePath) {
  const [, client] = getPathParts(sourcePath)
  if (client === 'QuantumultX') return 'Quantumult X'
  return client
}

function getApp(sourcePath) {
  return getPathParts(sourcePath)[2] ?? ''
}

function getKind(sourcePath) {
  if (sourcePath.startsWith('rules/')) return 'ruleset'
  if (sourcePath.startsWith('script/')) return 'override'
  return 'unknown'
}

function getFormat(sourcePath) {
  if (sourcePath.endsWith('.list')) return 'list'
  if (sourcePath.endsWith('.stoverride')) return 'stoverride'
  return path.extname(sourcePath).slice(1)
}

function parseMetadata(raw) {
  const metadata = {}

  for (const line of raw.split('\n')) {
    const commentMatch = line.match(/^#\s*([A-Z0-9-]+):\s*(.+)$/)
    if (commentMatch) {
      metadata[commentMatch[1].toLowerCase()] = commentMatch[2].trim()
      continue
    }

    const yamlMatch = line.match(/^([A-Za-z][\w-]*):\s*['"]?(.+?)['"]?\s*$/)
    if (yamlMatch) {
      metadata[yamlMatch[1]] = yamlMatch[2].trim()
    }
  }

  return metadata
}

function toManifestItem(sourcePath, raw) {
  const kind = getKind(sourcePath)
  const metadata = parseMetadata(raw)

  return {
    id: sourcePath,
    kind,
    client: getClient(sourcePath),
    app: getApp(sourcePath),
    format: getFormat(sourcePath),
    path: sourcePath,
    rawUrl: `${rawBase}/${sourcePath}`,
    name: metadata.name ?? metadata.NAME ?? '',
    description: metadata.desc ?? '',
    category: kind === 'ruleset' ? '分流' : metadata.category ?? '覆写',
    updated: metadata.updated ?? metadata.date ?? '',
  }
}

const allFiles = await walk(rootDir)
const sourcePaths = allFiles
  .map(toRepoPath)
  .filter((sourcePath) => {
    if (sourcePath.startsWith('rules/') && sourcePath.endsWith('.list')) return true
    if (sourcePath.startsWith('script/') && sourcePath.endsWith('.stoverride')) return true
    return false
  })
  .sort((a, b) => a.localeCompare(b))

const items = []
for (const sourcePath of sourcePaths) {
  const raw = await readFile(path.join(rootDir, sourcePath), 'utf8')
  items.push(toManifestItem(sourcePath, raw))
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repo,
  rawBase,
  items,
}

await writeFile(path.join(rootDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`Generated manifest.json with ${items.length} items.`)
