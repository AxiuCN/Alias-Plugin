/**
 * 别名数据生成脚本
 *
 *   node scripts/sync-alias.mjs                # 在插件根或 bot 根都能跑
 *   node scripts/sync-alias.mjs --check        # 只比对，不写文件（CI / Action 用）
 *
 * 职责：
 *   1. 读上游别名文件（miao-plugin 的 6 个别名文件 + ZZZ-Plugin 的别名文件），只读、不改上游；
 *   2. 与本插件自维护的 data/custom.json 合并（同名条目 custom 覆盖上游）；
 *   3. 写出 data/alias.json（运行时唯一真相）与 data/source.json（上游内容哈希，供比对）。
 *
 * 输出是**确定性**的（键排序、条目排序、去重），因此同一输入重复跑不会产生 diff，
 * GitHub Action 可以「生成 → 比对 → 有变化才提交」。
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { normalizeKey, splitAliases } from '../components/normalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 脚本位于 <插件根>/scripts/：上一级是插件根，再上两级是 plugins/ 与 bot 根（app/）
const pluginRoot = path.resolve(__dirname, '..')
/** bot 根（app/）：既用于定位其它插件，也用于兜底解析 yaml 依赖 */
const botRoot = path.resolve(pluginRoot, '..', '..')

/** 上游别名文件清单：一个文件 = 一个 (游戏, 实体) 的数据来源（路径相对 bot 根 app/） */
const UPSTREAM = [
  { src: 'miao', game: 'gi', entity: 'character', rel: 'plugins/miao-plugin/resources/meta-gs/character/alias.js', exports: ['alias'] },
  { src: 'miao', game: 'gi', entity: 'weapon', rel: 'plugins/miao-plugin/resources/meta-gs/weapon/alias.js', exports: ['alias', 'abbr'] },
  { src: 'miao', game: 'gi', entity: 'artifact', rel: 'plugins/miao-plugin/resources/meta-gs/artifact/alias.js', exports: ['alias', 'setAbbr'] },
  { src: 'miao', game: 'hsr', entity: 'character', rel: 'plugins/miao-plugin/resources/meta-sr/character/alias.js', exports: ['alias'] },
  { src: 'miao', game: 'hsr', entity: 'weapon', rel: 'plugins/miao-plugin/resources/meta-sr/weapon/alias.js', exports: ['alias', 'abbr'] },
  { src: 'miao', game: 'hsr', entity: 'artifact', rel: 'plugins/miao-plugin/resources/meta-sr/artifact/alias.js', exports: ['alias', 'artiAbbr'] },
  { src: 'zzz', game: 'zzz', entity: 'character', rel: 'plugins/ZZZ-Plugin/defSet/alias.yaml', yaml: true }
]

const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const argValue = (name) => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : ''
}
const upstreamRoot = path.resolve(argValue('bot') || botRoot)
const dataDir = path.resolve(argValue('out') || path.join(pluginRoot, 'data'))

const warnings = []
const warn = (msg) => {
  warnings.push(msg)
  console.warn(`⚠ ${msg}`)
}

/* ============================================================
 *  读取
 * ============================================================ */

/** 从对象字面量源码里提取指定导出名（`export const <名> = { ... }`） */
function extractLiteral (source, name) {
  const marker = new RegExp(`export\\s+const\\s+${name}\\s*=`, 'u')
  const match = marker.exec(source)
  if (!match) return ''
  const start = source.indexOf('{', match.index + match[0].length)
  if (start < 0) return ''

  let depth = 0
  let quote = ''
  let escaped = false
  let lineComment = false
  let blockComment = false
  for (let i = start; i < source.length; i++) {
    const ch = source[i]
    const next = source[i + 1]
    if (lineComment) { if (ch === '\n') lineComment = false; continue }
    if (blockComment) { if (ch === '*' && next === '/') { blockComment = false; i++ } continue }
    if (quote) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '/' && next === '/') { lineComment = true; i++; continue }
    if (ch === '/' && next === '*') { blockComment = true; i++; continue }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue }
    if (ch === '{') { depth++; continue }
    if (ch === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  return ''
}

/**
 * 读一个 JS 别名文件里的若干个导出对象
 *
 * 主路径用 `import()`（带 mtime 缓存破坏），失败回退到「提取对象字面量 + 求值」——
 * 上游文件是纯数据对象，不依赖任何运行环境。
 * @returns {object} 合并后的 `{ 标准名: 别名串 }`
 */
async function readJsAliasFile (file, exports) {
  let mod = null
  try {
    mod = await import(`${pathToFileURL(file).href}?mtime=${fs.statSync(file).mtimeMs}`)
  } catch (err) {
    warn(`import 失败，改用文本解析：${path.relative(upstreamRoot, file)}（${err?.message || err}）`)
  }

  const out = {}
  if (mod) {
    for (const name of exports) {
      const value = mod[name]
      if (value && typeof value === 'object') Object.assign(out, value)
    }
    if (Object.keys(out).length) return out
  }

  const source = fs.readFileSync(file, 'utf8')
  for (const name of exports) {
    const literal = extractLiteral(source, name)
    if (!literal) continue
    try {
      // eslint-disable-next-line no-new-func
      Object.assign(out, new Function(`"use strict"; return (${literal});`)())
    } catch (err) {
      warn(`文本解析失败：${path.relative(upstreamRoot, file)} → ${name}（${err?.message || err}）`)
    }
  }
  return out
}

/** 读 YAML 别名文件（值可为数组或逗号分隔字符串） */
async function readYamlAliasFile (file) {
  let YAML
  try {
    YAML = (await import('yaml')).default
  } catch {
    try {
      YAML = (await import(pathToFileURL(path.join(botRoot, 'node_modules/yaml/dist/index.js')).href)).default
    } catch (err) {
      warn(`yaml 模块不可用，跳过 ${path.relative(upstreamRoot, file)}：${err?.message || err}`)
      return {}
    }
  }
  return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
}

/** 文件内容哈希（供 Action 比对上游是否变化） */
function sha256 (buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/* ============================================================
 *  合并与输出
 * ============================================================ */

/** 条目排序键：game → entity → src → 归一键 → 原文，保证输出稳定 */
function sortEntries (list) {
  return list.slice().sort((a, b) =>
    a.game.localeCompare(b.game)
    || a.entity.localeCompare(b.entity)
    || a.src.localeCompare(b.src)
    || normalizeKey(a.canonical).localeCompare(normalizeKey(b.canonical))
    || a.canonical.localeCompare(b.canonical, 'zh-Hans-CN')
    || a.alias.localeCompare(b.alias, 'zh-Hans-CN'))
}

/** 把 `{ 标准名: 别名串|数组 }` 摊平成条目数组 */
function toEntries (table, { game, entity, src }, stats) {
  const out = []
  for (const [canonical, value] of Object.entries(table || {})) {
    const name = String(canonical ?? '').trim()
    if (!name) continue
    const aliases = splitAliases(value, name)
    if (!aliases.length) continue
    stats.records++
    for (const alias of aliases) {
      stats.entries++
      out.push({ canonical: name, alias, game, entity, src })
    }
  }
  return out
}

/** 读本插件自维护的别名（data/custom.json） */
function readCustom () {
  const file = path.join(dataDir, 'custom.json')
  if (!fs.existsSync(file)) {
    warn(`自维护别名文件不存在，本次不含 custom 层：${path.relative(pluginRoot, file)}`)
    return {}
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    warn(`自维护别名文件解析失败，本次不含 custom 层：${err?.message || err}`)
    return {}
  }
}

/**
 * 比对已生成文件的「内容」是否与本次生成一致
 *
 * 只比 `pick` 取出的那部分（entries / upstream），时间戳之类的元数据不参与，
 * 否则每次运行都会被判成「有变化」。
 * @param {string} file - 已生成的文件
 * @param {object} nextDoc - 本次生成的内容
 * @param {(doc: object) => any} pick
 * @returns {boolean} 是否发生变化
 */
function compareContent (file, nextDoc, pick) {
  if (!fs.existsSync(file)) return true
  try {
    const current = JSON.parse(fs.readFileSync(file, 'utf8'))
    return JSON.stringify(pick(current)) !== JSON.stringify(pick(nextDoc))
  } catch {
    return true
  }
}

async function main () {
  const stats = { records: 0, entries: 0 }
  const upstreamMeta = []
  const all = []

  for (const item of UPSTREAM) {
    const file = path.join(upstreamRoot, item.rel)
    if (!fs.existsSync(file)) {
      warn(`上游文件不存在，已跳过：${item.rel}`)
      continue
    }
    const buffer = fs.readFileSync(file)
    upstreamMeta.push({
      src: item.src,
      game: item.game,
      entity: item.entity,
      file: item.rel,
      bytes: buffer.length,
      sha256: sha256(buffer)
    })

    const table = item.yaml
      ? await readYamlAliasFile(file)
      : await readJsAliasFile(file, item.exports)
    const before = stats.entries
    all.push(...toEntries(table, item, stats))
    console.log(`· ${item.rel} → ${stats.entries - before} 条（${item.game}/${item.entity}/${item.src}）`)
  }

  // 自维护层：与同名的上游条目**合并别名**（不覆盖）——上游已维护的俗称不会因为并入而消失
  const custom = readCustom()
  const customEntries = []
  const customStats = { records: 0, entries: 0 }
  for (const [game, entities] of Object.entries(custom)) {
    if (game.startsWith('$')) continue
    for (const [entity, table] of Object.entries(entities || {})) {
      customEntries.push(...toEntries(table, { game, entity, src: 'custom' }, customStats))
    }
  }

  // 按 (游戏, 实体, 标准名) 归并：custom 与上游同名 → 别名合并为一条（标注 src = custom）
  const byCanonical = new Map()
  for (const item of all) {
    const id = `${item.game}|${item.entity}|${normalizeKey(item.canonical)}`
    const prev = byCanonical.get(id)
    if (prev) prev.aliases.push(item.alias)
    else byCanonical.set(id, { ...item, aliases: [item.alias], srcs: [item.src] })
  }
  let mergedWithUpstream = 0
  for (const item of customEntries) {
    const id = `${item.game}|${item.entity}|${normalizeKey(item.canonical)}`
    const prev = byCanonical.get(id)
    if (prev) {
      prev.aliases.push(item.alias)
      prev.srcs.push(item.src)
      mergedWithUpstream++
    } else {
      byCanonical.set(id, { ...item, aliases: [item.alias], srcs: [item.src] })
    }
  }

  const kept = []
  for (const item of byCanonical.values()) {
    for (const alias of splitAliases(item.aliases, item.canonical)) {
      kept.push({
        canonical: item.canonical,
        alias,
        game: item.game,
        entity: item.entity,
        src: item.srcs.includes('custom') ? 'custom' : item.src
      })
    }
  }
  const entries = sortEntries(kept)
  console.log(`· data/custom.json → ${customEntries.length} 条（其中 ${mergedWithUpstream} 条与上游同名，已合并别名）`)

  // 去重（同 四元组 完全一致）
  const seen = new Set()
  const final = []
  for (const e of entries) {
    const key = `${e.game}|${e.entity}|${e.src}|${normalizeKey(e.canonical)}|${normalizeKey(e.alias)}`
    if (seen.has(key)) continue
    seen.add(key)
    final.push(e)
  }

  const aliasDoc = {
    $comment: '由 scripts/sync-alias.mjs 生成，请勿手工编辑；自维护别名改 data/custom.json',
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: final
  }
  const sourceDoc = {
    $comment: '上游别名文件的内容指纹，供同步脚本 / GitHub Action 判定是否需要重新生成',
    version: 1,
    generatedAt: aliasDoc.generatedAt,
    upstream: upstreamMeta,
    counts: {
      entries: final.length,
      customMergedWithUpstream: mergedWithUpstream
    }
  }

  const aliasJson = `${JSON.stringify(aliasDoc, null, 2)}\n`
  const sourceJson = `${JSON.stringify(sourceDoc, null, 2)}\n`

  if (checkOnly) {
    // 只比对「内容」：entries 与上游指纹。generatedAt 每次都会变，不参与比对。
    const aliasChanged = compareContent(path.join(dataDir, 'alias.json'), aliasDoc, doc => doc.entries)
    const sourceChanged = compareContent(path.join(dataDir, 'source.json'), sourceDoc, doc => doc.upstream)
    const changed = [aliasChanged && 'alias.json', sourceChanged && 'source.json'].filter(Boolean)
    if (changed.length) {
      console.log(`\n需要更新：${changed.join(', ')}`)
      process.exit(1)
    }
    console.log('\n数据已是最新')
    return
  }

  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'alias.json'), aliasJson, 'utf8')
  fs.writeFileSync(path.join(dataDir, 'source.json'), sourceJson, 'utf8')
  console.log(`\n写出 data/alias.json：${final.length} 条映射`)
  console.log('写出 data/source.json：上游指纹')
  if (warnings.length) console.log(`\n告警 ${warnings.length} 条（见上）`)
}

await main()
