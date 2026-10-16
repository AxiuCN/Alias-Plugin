/**
 * 公共别名服务（业务出口）
 *
 * 运行期读本机数据，**没有共享生成物**：
 *   miao / ZZZ 预设（位置 1）+ 仓库自带 `data/aliases.json`（位置 2）+ 实例自定义（位置 3）。
 * 实例自定义别名是各实例私有数据，只在本机读取，绝不写入仓库文件。
 *
 * 对外只提供查询；归组、匹配之后怎么用是调用方的事。
 * 降级契约：插件缺失 / 文件损坏 / 名字解析不到，一律跳过并告警，**不抛错、不阻断加载**。
 */
import { readOverlayAliases, readMiaoCustomAliases, readPresetAliases } from '../model/AliasSources.js'
import { POSITIONS, buildIndex, query, variantsOf } from '../model/AliasIndex.js'
import { TIERS, normalizeEntity, normalizeGame, tierLevel } from '../components/entityNames.js'

/** 观测计数（状态展示用） */
const stats = { lookups: 0, hits: 0, misses: 0, ambiguous: 0, rebuilds: 0 }

/** 索引构建次数与耗时（状态用） */
let lastBuild = { at: 0, costMs: 0 }

/**
 * 建索引
 *
 * **每次调用都重新读盘并合成**：别名表规模不大（几千条），而"绝不缓存过期数据"
 * 比省这点开销重要得多——实例自定义别名文件随时可能被 miao 的命令改写，
 * 重算天然就是热更新，不需要文件监听，也不会出现缓存的合法性判断。
 */
async function build () {
  const started = Date.now()
  const presets = await readPresetAliases()
  const overlay = readOverlayAliases()
  const custom = readMiaoCustomAliases()
  const index = buildIndex({ presets: presets.records, overlay, custom })
  const built = {
    index,
    loaded: presets.loaded,
    counts: {
      preset: presets.records.length,
      overlay: overlay.length,
      custom: custom.length
    },
    builtAt: Date.now()
  }
  lastBuild = { at: built.builtAt, costMs: Date.now() - started }
  stats.rebuilds++
  logger?.info(`[Alias] 别名表已加载：${index.standards.length} 个原名 / ${index.map.size} 个关键词（预设 ${presets.records.length} 条，自带 ${overlay.length} 条，实例自定义 ${custom.length} 条）`)
  if (!presets.loaded.miao) logger?.warn('[Alias] 未找到 miao-plugin，别名数据为空；本插件不阻断其他插件加载')
  if (index.skipped) logger?.warn(`[Alias] 跳过非法条目 ${index.skipped} 条`)
  if (index.unresolvedCustom) logger?.warn(`[Alias] 实例自定义别名中 ${index.unresolvedCustom} 行未匹配到已收录的名字，已跳过`)
  return built
}

/**
 * 取当前别名表（每次重新合成，不做缓存）
 * @returns {Promise<object>} 构建结果
 */
export async function ensureIndex () {
  try {
    return await build()
  } catch (err) {
    // 构建失败也必须给出可用的空表，绝不把异常抛给调用方
    logger?.warn(`[Alias] 别名表构建失败，本次以空表运行：${err?.message || err}`)
    return {
      index: { map: new Map(), standards: [], skipped: 0, unresolvedCustom: 0 },
      loaded: { miao: false, zzz: false },
      counts: { preset: 0, overlay: 0, custom: 0 },
      builtAt: Date.now(),
      error: String(err?.message || err)
    }
  }
}

/** 重建（语义上就是重新读一遍；保留该出口便于调用方显式刷新） */
export async function reload () {
  const ret = await ensureIndex()
  return { ok: !ret.error && ret.index.standards.length > 0, error: ret.error || '', count: ret.index.standards.length }
}

/**
 * 查询关键词命中的原名
 * @param {string} keyword
 * @param {{game?: string, entity?: string}} [opts]
 * @returns {Promise<{status: string, canonical: string|null, candidates: Array, keyword: string, normalized: string}>}
 */
export async function lookup (keyword, opts = {}) {
  stats.lookups++
  const text = String(keyword ?? '').trim()
  const empty = { status: 'none', canonical: null, candidates: [], keyword: text, normalized: '' }
  if (!text) {
    stats.misses++
    return empty
  }

  const { index } = await ensureIndex()
  const hits = query(index, text, {
    game: opts.game ? normalizeGame(opts.game) : '',
    entity: opts.entity ? normalizeEntity(opts.entity) : ''
  })

  if (!hits.length) {
    stats.misses++
    return empty
  }

  const normalized = hits[0].standard.name
  const candidates = hits.map(hit => ({
    canonical: hit.standard.name,
    game: hit.standard.game,
    entity: hit.standard.entity,
    tier: hit.standard.tier,
    tierLabel: TIERS[hit.standard.tier]?.label || '',
    position: hit.standard.position,
    positionLabel: positionLabel(hit.standard.position),
    matchedBy: hit.matchedBy
  }))

  if (candidates.length === 1) {
    stats.hits++
    return { status: 'exact', canonical: candidates[0].canonical, candidates, keyword: text, normalized }
  }

  stats.ambiguous++
  return { status: 'ambiguous', canonical: null, candidates, keyword: text, normalized }
}

/**
 * 关键词的全部写法（第一个固定为入参原文）
 * @param {string} keyword
 * @param {{game?: string}} [opts]
 * @returns {Promise<string[]>}
 */
export async function variants (keyword, opts = {}) {
  const { index } = await ensureIndex()
  return variantsOf(index, keyword, { game: opts.game ? normalizeGame(opts.game) : '' })
}

/**
 * 别名清单：**按原名归组**，别名是数组
 * @param {{game?: string, entity?: string, limit?: number}} [opts]
 * @returns {Promise<Array<{canonical: string, alias: string[], game: string, entity: string, tier: string, position: number}>>}
 */
export async function list (opts = {}) {
  const { index } = await ensureIndex()
  const game = opts.game ? normalizeGame(opts.game) : ''
  const entity = opts.entity ? normalizeEntity(opts.entity) : ''

  const out = []
  for (const standard of index.standards) {
    if (game && standard.game !== game) continue
    if (entity && standard.entity !== entity) continue
    out.push({
      canonical: standard.name,
      alias: [...standard.aliases],
      game: standard.game,
      entity: standard.entity,
      tier: standard.tier,
      position: standard.position
    })
  }

  const limit = Number(opts.limit)
  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out
}

/**
 * 服务自检（不回显服务器绝对路径、不回显实例私有数据内容）
 * @returns {Promise<object>}
 */
export async function status () {
  const built = await ensureIndex()
  const byGame = {}
  const byEntity = {}
  const byTier = {}
  const byPosition = {}
  for (const standard of built.index.standards) {
    byGame[standard.game] = (byGame[standard.game] || 0) + 1
    byEntity[standard.entity] = (byEntity[standard.entity] || 0) + 1
    byTier[standard.tier] = (byTier[standard.tier] || 0) + 1
    const label = positionLabel(standard.position)
    byPosition[label] = (byPosition[label] || 0) + 1
  }
  return {
    ok: !built.error && built.index.standards.length > 0,
    error: built.error || '',
    standards: built.index.standards.length,
    keywords: built.index.map.size,
    aliases: built.index.standards.reduce((sum, s) => sum + s.aliases.size, 0),
    skipped: built.index.skipped,
    unresolvedCustom: built.index.unresolvedCustom,
    loaded: built.loaded,
    counts: built.counts,
    byGame,
    byEntity,
    byTier,
    byPosition,
    builtAt: built.builtAt,
    buildCostMs: lastBuild.costMs,
    stats: { ...stats }
  }
}

/** 位置标签 */
function positionLabel (position) {
  const found = Object.entries(POSITIONS).find(([, value]) => value === position)
  return found ? found[0] : `unknown(${position})`
}

export { TIERS, POSITIONS }
