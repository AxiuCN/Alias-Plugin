/**
 * 别名数据文件读取（数据层，只读）
 *
 * 数据文件（均入库，随仓库分发）：
 *   data/alias.json   运行时唯一真相：上游与本插件自维护合并后的别名边表
 *   data/source.json  上游指纹（各上游文件的 sha256），供 GitHub Action 判定是否需要重新生成
 *
 * 生成物一律由 `scripts/sync-alias.mjs` 产出，运行期**只读不写**。
 * 来源不参与任何判定，因此边表里**没有** src 字段。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot } from '../components/config.js'

/** 数据目录（测试可用 ALIAS_DATA_DIR 指向夹具，生产不设该变量） */
export function resolveDataDir () {
  return process.env.ALIAS_DATA_DIR
    ? path.resolve(process.env.ALIAS_DATA_DIR)
    : path.join(pluginRoot, 'data')
}

/** 别名表文件路径 */
export function aliasFilePath () {
  return path.join(resolveDataDir(), 'alias.json')
}

/** 来源元数据文件路径 */
export function sourceFilePath () {
  return path.join(resolveDataDir(), 'source.json')
}

/**
 * 读数据文件
 * 任何失败都不抛错：返回 `{ ok:false, reason, data:null }`，由调用方决定如何降级
 * @param {string} file
 * @returns {{ok: boolean, reason: string, data: any}}
 */
export function readJsonFile (file) {
  if (!fs.existsSync(file)) return { ok: false, reason: '数据文件不存在', data: null }
  try {
    return { ok: true, reason: '', data: JSON.parse(fs.readFileSync(file, 'utf8')) }
  } catch (err) {
    return { ok: false, reason: `JSON 解析失败：${err?.message || err}`, data: null }
  }
}

/** 别名表文件是否可读（套件前置检查用） */
export function hasAliasData () {
  return fs.existsSync(aliasFilePath())
}

/** 数据文件最后修改时间（毫秒；取不到返回 0） */
export function aliasFileMtime () {
  try {
    return fs.statSync(aliasFilePath()).mtimeMs
  } catch {
    return 0
  }
}

/**
 * 读别名条目数组
 * 结构不合法（非数组 / 条目缺字段）一律降级为空数组并告警，绝不抛穿
 * @returns {{entries: Array, reason: string}}
 */
export function readAliasEntries () {
  const ret = readJsonFile(aliasFilePath())
  if (!ret.ok) return { entries: [], reason: ret.reason }

  const list = Array.isArray(ret.data?.entries) ? ret.data.entries : null
  if (!list) return { entries: [], reason: 'alias.json 结构异常：缺少 entries 数组' }

  const entries = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const canonical = String(item.canonical ?? '').trim()
    const alias = String(item.alias ?? '').trim()
    if (!canonical || !alias) continue
    entries.push({
      canonical,
      alias,
      game: String(item.game ?? ''),
      entity: String(item.entity ?? '')
    })
  }
  return { entries, reason: '' }
}

/** 读上游指纹（供状态展示与 Action 比对；读不出来返回 null） */
export function readSourceMeta () {
  const ret = readJsonFile(sourceFilePath())
  return ret.ok ? ret.data : null
}
