/**
 * 别名来源读取（数据层，只读）
 *
 * 全部在**运行期读本机**，没有共享生成物：
 *   data/aliases.json         仓库自带别名（位置 2；Action 以后把扒到的别名也写这里）
 *   plugins/miao-plugin/**    预设别名（位置 1，基础）
 *   plugins/ZZZ-Plugin/**     预设别名（位置 1，选装）
 *   miao-plugin/config/*.cfg  实例自定义别名（位置 3，**各实例私有**，绝不进仓库数据）
 *
 * 读路径优先用 `ALIAS_MIAO_DIR` / `ALIAS_ZZZ_DIR`（套件用），否则以 bot 根推导；
 * 生产不设这两个变量。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { pluginRoot } from '../components/config.js'
import { normalizeEntity, normalizeGame } from '../components/entityNames.js'
import { MIAO_ALIAS_FILES, MIAO_CUSTOM_FILES, ZZZ_ALIAS_FILE } from './UpstreamFiles.js'

/** bot 根目录（app/）：插件根上两级 */
export const botRoot = path.resolve(pluginRoot, '..', '..')

/** miao-plugin 根目录 */
export function miaoRoot () {
  return process.env.ALIAS_MIAO_DIR
    ? path.resolve(process.env.ALIAS_MIAO_DIR)
    : path.join(botRoot, 'plugins', 'miao-plugin')
}

/** ZZZ-Plugin 根目录 */
export function zzzRoot () {
  return process.env.ALIAS_ZZZ_DIR
    ? path.resolve(process.env.ALIAS_ZZZ_DIR)
    : path.join(botRoot, 'plugins', 'ZZZ-Plugin')
}

/** 仓库自带别名文件路径（Action 以后也写这里） */
export function overlayFilePath () {
  return path.join(pluginRoot, 'data', 'aliases.json')
}

/** 解析原生模块（失败返回 null，不抛穿） */
async function importModule (file) {
  try {
    return await import(`${pathToFileURL(file).href}?mtime=${fs.statSync(file).mtimeMs}`)
  } catch (err) {
    logger?.warn(`[Alias] 原生模块加载失败：${path.basename(file)}（${err?.message || err}）`)
    return null
  }
}

/**
 * 从对象字面量源码里提取 `export const <名> = { … }` 的平衡括号内容
 * 供 `import` 失败时回退（上游是纯数据对象，不依赖运行环境）
 */
function extractLiterals (source) {
  const out = []
  const re = /export\s+const\s+[A-Za-z0-9_$]+\s*=/gu
  let match
  while ((match = re.exec(source))) {
    const start = source.indexOf('{', match.index + match[0].length)
    if (start < 0) continue
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
        if (depth === 0) { out.push(source.slice(start, i + 1)); break }
      }
    }
    re.lastIndex = start
  }
  return out
}

/**
 * 读一个 JS 别名文件里的**全部对象导出**并合并
 *
 * 上游导出名不统一，因此不按名字取；合并时同一标准名的多个来源取并集
 * （例如圣遗物的 `setAbbr` 与 `setAlias` 各写了同一个套装的一部分别名）。
 * @param {string} file
 * @returns {Record<string, string>} 标准名 → 别名串（多条用逗号连接）
 */
export async function readJsAliasFile (file) {
  if (!fs.existsSync(file)) return {}

  const merged = {}
  const collect = (obj) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return
    for (const [name, value] of Object.entries(obj)) {
      if (!name) continue
      const text = Array.isArray(value) ? value.join(',') : String(value ?? '')
      merged[name] = merged[name] ? `${merged[name]},${text}` : text
    }
  }

  const mod = await importModule(file)
  if (mod) {
    for (const [key, value] of Object.entries(mod)) {
      if (key === 'default') continue
      collect(value)
    }
  }

  if (!Object.keys(merged).length) {
    for (const literal of extractLiterals(fs.readFileSync(file, 'utf8'))) {
      try {
        // eslint-disable-next-line no-new-func
        collect(new Function(`"use strict"; return (${literal});`)())
      } catch {
        // 单个字面量解析失败只跳过它
      }
    }
  }

  return merged
}

/** 读 YAML 别名文件（ZZZ-Plugin：值为数组） */
export async function readYamlAliasFile (file) {
  if (!fs.existsSync(file)) return {}
  let YAML
  try {
    YAML = (await import('yaml')).default
  } catch {
    try {
      YAML = (await import(pathToFileURL(path.join(botRoot, 'node_modules/yaml/dist/index.js')).href)).default
    } catch (err) {
      logger?.warn(`[Alias] yaml 模块不可用，跳过 ${path.basename(file)}：${err?.message || err}`)
      return {}
    }
  }
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch (err) {
    logger?.warn(`[Alias] YAML 解析失败（${path.basename(file)}）：${err?.message || err}`)
    return {}
  }
}

/**
 * 读仓库自带别名 `data/aliases.json`（可选；不存在返回空数组）
 * 形状与实例自定义一致，便于 Action 以后把扒到的别名写进来：
 *   `{ "aliases": [ { canonical, alias, game, entity } ] }`
 * @returns {Array}
 */
export function readOverlayAliases () {
  const file = overlayFilePath()
  if (!fs.existsSync(file)) return []
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    const list = Array.isArray(doc?.aliases) ? doc.aliases : []
    return list.filter(item => item && item.canonical && item.alias)
  } catch (err) {
    logger?.warn(`[Alias] 自带别名文件解析失败（${path.basename(file)}），已跳过：${err?.message || err}`)
    return []
  }
}

/** 解析 miao 自定义 cfg 单行：`标准名：别名1，别名2`（兼容中英文冒号/逗号） */
export function parseCustomLine (line) {
  const match = /^([^：:]+)[：:](.*)$/.exec(String(line ?? '').trim())
  if (!match) return null
  const name = match[1].trim()
  const aliases = match[2].split(/[,，、]/).map(t => t.trim()).filter(Boolean)
  if (!name || !aliases.length) return null
  return { name, aliases }
}

/**
 * 读 miao 实例自定义别名（**各实例私有**）
 * 只读本机文件；解析失败的行跳过，不影响其他行
 * @returns {Array<{name: string, aliases: string[], game: string}>}
 */
export function readMiaoCustomAliases () {
  const out = []
  const root = miaoRoot()
  for (const item of MIAO_CUSTOM_FILES) {
    const file = path.join(root, item.rel)
    if (!fs.existsSync(file)) continue
    let content = ''
    try {
      content = fs.readFileSync(file, 'utf8')
    } catch (err) {
      logger?.warn(`[Alias] 读取实例自定义别名失败（${item.rel}）：${err?.message || err}`)
      continue
    }
    for (const line of content.split(/\r?\n/)) {
      const entry = parseCustomLine(line)
      if (!entry) continue
      out.push({ name: entry.name, aliases: entry.aliases, game: item.game })
    }
  }
  return out
}

/**
 * 读全部预设别名（miao + ZZZ）
 * @returns {{records: Array<{canonical: string, alias: string, game: string, entity: string}>, loaded: {miao: boolean, zzz: boolean}}}
 */
export async function readPresetAliases () {
  const records = []
  const miao = miaoRoot()
  const zzz = zzzRoot()

  for (const item of MIAO_ALIAS_FILES) {
    const table = await readJsAliasFile(path.join(miao, item.rel))
    for (const [canonical, value] of Object.entries(table)) {
      for (const alias of splitAliasText(value)) {
        records.push({ canonical, alias, game: item.game, entity: item.entity })
      }
    }
  }

  const zzzTable = await readYamlAliasFile(path.join(zzz, ZZZ_ALIAS_FILE.rel))
  for (const [canonical, value] of Object.entries(zzzTable)) {
    for (const alias of splitAliasText(value)) {
      records.push({ canonical, alias, game: ZZZ_ALIAS_FILE.game, entity: ZZZ_ALIAS_FILE.entity })
    }
  }

  return {
    records,
    loaded: {
      miao: fs.existsSync(miao),
      zzz: fs.existsSync(path.join(zzz, ZZZ_ALIAS_FILE.rel))
    }
  }
}

/** 别名串 → 数组（去掉空项与自我引用，按归一化键去重） */
function splitAliasText (value) {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(/[,，、]/)
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const text = String(item ?? '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}

/** 校验游戏 / 实体（供索引构建前的过滤） */
export function isValidTarget (game, entity) {
  return Boolean(normalizeGame(game) && normalizeEntity(entity))
}
