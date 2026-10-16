/**
 * 别名索引（纯内存结构，零 I/O）
 *
 * 条目形状：
 *   `{ key, standard, matched, canonical, alias, game, entity, src, priority }`
 *   - `key`      本条目的索引键（归一化后）
 *   - `standard` 标准名（**永远是标准名**，查询结果给调用方的就是它）
 *   - `matched`  命中的另一个写法（标准名 ↔ 别名 的另一端）
 *   - `canonical` / `alias` 为输入原文，仅供溯源
 * 正反双向各存一条，因此任一写法都能查到，且结果字段口径一致。
 *
 * 覆盖语义（逐条目判定）：
 *   同一 `(归一键, game, entity)` 下若存在**多个标准名**，只保留来源优先级最高的那批
 *   —— 即「自维护别名覆盖上游别名」。同批内的多个标准名共存（如何取舍归调用方）。
 */
import { normalizeKey } from '../components/normalize.js'
import { isKnownSource, normalizeEntity, normalizeGame, sourcePriority } from '../components/sources.js'

/**
 * 构建索引
 * @param {Array} rawEntries - `{ canonical, alias, game, entity, src }[]`
 * @returns {{map: Map<string, Array>, entries: Array, skipped: number, deduped: number}}
 *   map：归一键 → 条目[]；entries：双向展开后的有效条目
 */
export function buildIndex (rawEntries) {
  const dedup = new Set()
  const entries = []
  let skipped = 0
  let deduped = 0

  for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
    const game = normalizeGame(raw?.game)
    const entity = normalizeEntity(raw?.entity)
    const src = isKnownSource(raw?.src) ? raw.src : ''
    const canonical = String(raw?.canonical ?? '').trim()
    const alias = String(raw?.alias ?? '').trim()
    if (!game || !entity || !src || !canonical || !alias) {
      skipped++
      continue
    }

    const cKey = normalizeKey(canonical)
    const aKey = normalizeKey(alias)
    // 归一后相同（名字本身只差包裹符号等）→ 无映射价值，按跳过统计
    if (!cKey || !aKey || cKey === aKey) {
      skipped++
      continue
    }

    const id = `${game}|${entity}|${src}|${cKey}|${aKey}`
    if (dedup.has(id)) {
      deduped++
      continue
    }
    dedup.add(id)

    const base = { canonical, alias, game, entity, src, priority: sourcePriority(src) }
    // 正向：用标准名查到别名；反向：用别名查到标准名。
    // 两条都带 `standard`（永远是标准名）与 `matched`（本条命中的那个写法）。
    entries.push({ ...base, key: cKey, standard: canonical, matched: alias })
    entries.push({ ...base, key: aKey, standard: canonical, matched: alias })
  }

  const map = new Map()
  for (const item of entries) {
    const list = map.get(item.key)
    if (list) list.push(item)
    else map.set(item.key, [item])
  }

  return { map, entries, skipped, deduped }
}

/**
 * 查询键命中的条目
 * @param {object} index - buildIndex 的返回值
 * @param {string} keyword
 * @param {{game?: string, entity?: string}} [filter]
 * @returns {Array} 条目[]（按优先级降序、标准名升序）
 */
export function query (index, keyword, filter = {}) {
  const key = normalizeKey(keyword)
  if (!key || !index?.map) return []
  const game = filter.game ? normalizeGame(filter.game) : ''
  const entity = filter.entity ? normalizeEntity(filter.entity) : ''

  const list = (index.map.get(key) || []).filter(item =>
    (!game || item.game === game) && (!entity || item.entity === entity))

  // 覆盖：同一 (键, 游戏, 实体) 下按标准名取优先级最高的一批；
  // 同一标准名的多条（多个别名）**全部保留**——取最高优先级只影响标准名之间的取舍。
  const groups = new Map()
  for (const item of list) {
    const id = `${item.game}|${item.entity}|${normalizeKey(item.standard)}`
    const group = groups.get(id)
    if (group) group.push(item)
    else groups.set(id, [item])
  }
  const maxPriority = groups.size
    ? Math.max(...[...groups.values()].map(g => Math.max(...g.map(i => i.priority))))
    : 0

  return [...groups.values()]
    .filter(group => Math.max(...group.map(i => i.priority)) === maxPriority)
    .flat()
    .sort((a, b) =>
      a.standard.localeCompare(b.standard, 'zh-Hans-CN')
      || a.matched.localeCompare(b.matched, 'zh-Hans-CN'))
}

/**
 * 某关键词的全部别名写法（原词 + 命中条目的其它写法）
 *
 * 供「一次要搜多个写法」的消费场景取用；写法本身不做任何语义加工。
 * @param {object} index
 * @param {string} keyword
 * @param {{game?: string}} [filter]
 * @returns {string[]} 去重后的写法数组（第一个固定为原词）
 */
export function variantsOf (index, keyword, filter = {}) {
  const text = String(keyword ?? '').trim()
  if (!text) return []
  const out = [text]
  const seen = new Set([normalizeKey(text)])
  for (const item of query(index, text, filter)) {
    for (const value of [item.standard, item.matched]) {
      const key = normalizeKey(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}
