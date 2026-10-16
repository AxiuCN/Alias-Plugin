/**
 * 公共别名服务（业务出口）
 *
 * 对外只提供查询：命中、候选、变体、清单、状态与手动重建。
 * **不提供写入接口** —— 别名数据的增改由数据文件 + `scripts/sync-alias.mjs` 完成，
 * 后期由 GitHub Action 自动同步上游。
 *
 * 降级契约：数据缺失 / 解析失败 / 结构异常，一律返回「未命中」并 `logger.warn`，
 * **不抛错、不阻断调用方加载**。
 */
import { normalizeKey } from '../components/normalize.js'
import { normalizeEntity, normalizeGame } from '../components/sources.js'
import { aliasFileMtime, readAliasEntries, readSourceMeta } from '../model/AliasFile.js'
import { buildIndex, query, variantsOf } from '../model/AliasIndex.js'
import { startWatch, stopWatch, watchState } from './HotReload.js'

/** 进程内索引缓存（同步构建，因此不存在「并发读到半成品」的窗口） */
const cache = {
  built: false,
  index: null,
  error: '',
  builtAt: 0
}

/** 挂载数据文件监听（惰性一次，由 ensureIndex 触发） */
let watchHooked = false

/** 观测计数（状态展示用） */
const stats = {
  lookups: 0,
  hits: 0,
  misses: 0,
  ambiguous: 0,
  reloads: 0
}

/**
 * 确保索引已构建（同步，幂等）
 * @returns {object} 索引对象
 */
export function ensureIndex () {
  if (!cache.built) build()
  if (!watchHooked) {
    watchHooked = true
    startWatch(reload)
  }
  return cache.index
}

/** 同步构建索引（读盘 + 建表，无 await → 无竞态） */
function build () {
  const { entries, reason } = readAliasEntries()
  const index = buildIndex(entries)
  cache.built = true
  cache.index = index
  cache.error = reason
  cache.builtAt = Date.now()

  if (reason) {
    logger?.warn(`[Alias] 别名数据不可用（${reason}），查询一律返回未命中；请检查 data/alias.json 或执行 pnpm sync`)
  } else {
    const meta = readSourceMeta()
    const when = meta?.generatedAt ? `，生成于 ${meta.generatedAt}` : ''
    logger?.info(`[Alias] 别名表已加载：${index.entries.length} 条映射 / ${index.map.size} 个关键词${when}`)
    if (index.skipped) logger?.warn(`[Alias] 跳过非法条目 ${index.skipped} 条`)
  }
  return index
}

/**
 * 重建索引（数据文件变更后调用，也供外部手动调用）
 * @returns {{ok: boolean, error: string, count: number}}
 */
export function reload () {
  stats.reloads++
  const index = build()
  return { ok: !cache.error, error: cache.error, count: index.entries.length }
}

/**
 * 查询关键词命中的标准名
 *
 * 只回事实，不替调用方决定怎么用：
 * - `exact`    唯一标准名
 * - `ambiguous` 多个标准名（`candidates` 给出全部）
 * - `none`     未命中
 * @param {string} keyword
 * @param {{game?: string, entity?: string}} [opts] - 可选限定游戏 / 实体
 * @returns {{status: string, canonical: string|null, candidates: Array, keyword: string, normalized: string}}
 */
export function lookup (keyword, opts = {}) {
  stats.lookups++
  const text = String(keyword ?? '').trim()
  const empty = { status: 'none', canonical: null, candidates: [], keyword: text, normalized: '' }
  if (!text) {
    stats.misses++
    return empty
  }

  const index = ensureIndex()
  const filter = {
    game: opts.game ? normalizeGame(opts.game) : '',
    entity: opts.entity ? normalizeEntity(opts.entity) : ''
  }
  const hits = query(index, text, filter)
  const normalized = normalizeKey(text)

  if (!hits.length) {
    stats.misses++
    return { ...empty, normalized }
  }

  // 同一标准名可能命中多条（多来源），归并成候选
  const candidates = []
  const seen = new Set()
  for (const item of hits) {
    const key = normalizeKey(item.standard)
    if (seen.has(key)) continue
    seen.add(key)
    candidates.push({
      canonical: item.standard,
      game: item.game,
      entity: item.entity,
      src: item.src,
      matchedBy: normalizeKey(item.standard) === normalized ? 'canonical' : 'alias'
    })
  }

  if (candidates.length === 1) {
    stats.hits++
    return { status: 'exact', canonical: candidates[0].canonical, candidates, keyword: text, normalized }
  }

  stats.ambiguous++
  return { status: 'ambiguous', canonical: null, candidates, keyword: text, normalized }
}

/**
 * 关键词的全部别名写法（原词 + 命中的另一端；第一个固定为原词）
 * @param {string} keyword
 * @param {{game?: string}} [opts]
 * @returns {string[]}
 */
export function variants (keyword, opts = {}) {
  const index = ensureIndex()
  return variantsOf(index, keyword, {
    game: opts.game ? normalizeGame(opts.game) : ''
  })
}

/**
 * 别名条目清单
 * @param {{game?: string, entity?: string, src?: string, limit?: number}} [opts]
 * @returns {Array}
 */
export function list (opts = {}) {
  const index = ensureIndex()
  const game = opts.game ? normalizeGame(opts.game) : ''
  const entity = opts.entity ? normalizeEntity(opts.entity) : ''
  const src = String(opts.src ?? '').trim()

  let out = index.entries
  if (game) out = out.filter(i => i.game === game)
  if (entity) out = out.filter(i => i.entity === entity)
  if (src) out = out.filter(i => i.src === src)

  const limit = Number(opts.limit)
  const sliced = Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out.slice()
  // 返回副本：调用方改动结果不得污染索引
  return sliced.map(i => ({ ...i }))
}

/**
 * 服务状态（自检用；不回显服务器绝对路径）
 * @returns {object}
 */
export function status () {
  const index = ensureIndex()
  const meta = readSourceMeta()
  const mtime = aliasFileMtime()

  const byGame = {}
  const bySrc = {}
  for (const item of index.entries) {
    byGame[item.game] = (byGame[item.game] || 0) + 1
    bySrc[item.src] = (bySrc[item.src] || 0) + 1
  }

  return {
    ok: !cache.error && index.entries.length > 0,
    error: cache.error,
    entries: index.entries.length,
    keywords: index.map.size,
    skipped: index.skipped,
    byGame,
    bySrc,
    builtAt: cache.builtAt,
    dataUpdatedAt: mtime ? new Date(mtime).toISOString() : '',
    upstream: meta?.upstream || [],
    stats: { ...stats },
    watch: watchState()
  }
}

/** 清空缓存（测试与手动干预用；下次查询会重建） */
export function reset () {
  cache.built = false
  cache.index = null
  cache.error = ''
  cache.builtAt = 0
}

/** 停止数据文件监听（测试收尾用） */
export function stopReload () {
  watchHooked = false
  stopWatch()
}
