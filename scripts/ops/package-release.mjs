import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

const portals = ['student', 'counselor', 'academic', 'logistics', 'mentor']
const tag =
  process.argv[2] ||
  new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const releaseRoot = path.resolve('release', tag)
const portalSource = path.resolve('dist-portals')

for (const portal of portals) {
  await stat(path.join(portalSource, portal, 'index.html'))
}

let commit = process.env.RELEASE_COMMIT || 'unknown'
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  try {
    const dotGit = (await readFile('.git', 'utf8')).trim()
    const gitDir = dotGit.startsWith('gitdir: ')
      ? path.resolve(dotGit.slice(8))
      : path.resolve('.git')
    const head = (await readFile(path.join(gitDir, 'HEAD'), 'utf8')).trim()
    if (head.startsWith('ref: ')) {
      const ref = head.slice(5)
      let refRoot = gitDir
      try {
        const common = (await readFile(path.join(gitDir, 'commondir'), 'utf8')).trim()
        refRoot = path.resolve(gitDir, common)
      } catch {
        // Standard repositories keep refs directly under .git.
      }
      commit = (await readFile(path.join(refRoot, ref), 'utf8')).trim()
    } else {
      commit = head
    }
  } catch {
    // Release can still be assembled from an exported source archive.
  }
}

await mkdir(releaseRoot, { recursive: true })
await cp(portalSource, path.join(releaseRoot, 'portals'), { recursive: true })
await cp('server', path.join(releaseRoot, 'server'), {
  recursive: true,
  filter: (source) => {
    const relative = path.relative('server', source).replaceAll('\\', '/')
    return !(
      relative === 'data' ||
      relative.startsWith('data/') ||
      relative === 'backups' ||
      relative.startsWith('backups/')
    )
  },
})
await cp('scripts/ops', path.join(releaseRoot, 'ops'), { recursive: true })
await cp('deploy', path.join(releaseRoot, 'deploy'), { recursive: true })
await mkdir(path.join(releaseRoot, 'docs'), { recursive: true })
for (const file of [
  'docs/D直达报修与异议验收.md',
  'docs/首次试用部署与回退清单.md',
  'docs/第二轮D验收汇总.md',
]) {
  await cp(file, path.join(releaseRoot, 'docs', path.basename(file)))
}
for (const file of ['package.json', 'package-lock.json']) {
  await cp(file, path.join(releaseRoot, file))
}

async function filesBelow(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await filesBelow(target)))
    else files.push(target)
  }
  return files
}

const hashes = {}
for (const file of await filesBelow(releaseRoot)) {
  if (file.endsWith('SHA256SUMS.json')) continue
  const relative = path.relative(releaseRoot, file).replaceAll('\\', '/')
  hashes[relative] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex')
}

const manifest = {
  name: '智汇中枢五端试用候选版',
  tag,
  commit,
  generatedAt: new Date().toISOString(),
  portals,
  entryFiles: Object.fromEntries(
    portals.map((portal) => [portal, `portals/${portal}/index.html`]),
  ),
  node: process.version,
}
await writeFile(
  path.join(releaseRoot, 'release-manifest.json'),
  JSON.stringify(manifest, null, 2),
  'utf8',
)
await writeFile(
  path.join(releaseRoot, 'SHA256SUMS.json'),
  JSON.stringify(hashes, null, 2),
  'utf8',
)

console.log(`发布候选目录：${releaseRoot}`)
console.log(`提交：${commit}`)
console.log(`文件：${Object.keys(hashes).length + 1}`)
