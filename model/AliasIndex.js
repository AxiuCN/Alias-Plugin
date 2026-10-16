/**
 * 别名索引（纯内存结构，零 I/O）
 *
 * 条目形状：
 *   `{ key, standard, matched, tier, canonical, alias, game, entity }`
 *   - `key`      本条目的索引键（归一化后）
 *   - `standard` 标准名（**永远是标准名**，查询结果给调用方的就是它）
 *   - `matched`  命中的另一个写法
 *   - `tier`     **标准名**的档次（见 components/sources.js）：中文原名 > 外文原名
 *   - `matchedBy` 本次是按标准名还是按别名命中的
 *   - `canonical` / `alias` 为输入原文，仅供排序
 * 正反双向各存一条，因此任一写法都能查到，且结果字段口径一致。
 *
 * 冲突取舍（唯一的优先级依据是**标准名的档次**，与来源无关）：
 *   同一 `(归一键, game, entity)` 下有多个标准名时，只保留档次最高的那批；
 *   同档多个标准名共存，如何取舍归调用方。
 */
import { normalizeKey } from '../components/normalize.js'
import { normalizeEntity, normalizeGame, tierLevel, tierOf } from '../components/sources.js'

/**
 * 构建索引
 * @param {Array} rawEntries - `{ canonical, alias, game, entity }[]`
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
    const canonical = String(raw?.canonical ?? '').trim()
    const alias = String(raw?.alias ?? '').trim()
    if (!game || !entity || !canonical || !alias) {
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

    const id = `${game}|${entity}|${cKey}|${aKey}`
    if (dedup.has(id)) {
      deduped++
      continue
    }
    dedup.add(id)

    // 档次描述标准名本身（中文原名 > 外文原名），正反两行一致；
    // 正向行表示「本次按标准名命中」，反向行的 key 是别名
    const base = { canonical, alias, game, entity }
    const tier = tierOf(canonical)
    entries.push({ ...base, key: cKey, standard: canonical, matched: alias, tier, matchedBy: 'canonical' })
    entries.push({ ...base, key: aKey, standard: canonical, matched: alias, tier, matchedBy: 'alias' })
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
 * @returns {Array} 条目[]（按档次升序 = 优先级降序，再按标准名、命中写法排序）
 */
export function query (index, keyword, filter = {}) {
  const key = normalizeKey(keyword)
  if (!key || !index?.map) return []
  const game = filter.game ? normalizeGame(filter.game) : ''
  const entity = filter.entity ? normalizeEntity(filter.entity) : ''

  const list = (index.map.get(key) || []).filter(item =>
    (!game || item.game === game) && (!entity || item.entity === entity))

  // 同一标准名的多条（多个别名）全部保留；标准名之间按档次取舍
  // 取舍**限定在同一个 (游戏, 实体) 内**：跨游戏 / 跨实体的同名写法互不干扰
  const scopes = new Map()
  for (const item of list) {
    const scopeId = `${item.game}|${item.entity}`
    const scope = scopes.get(scopeId)
    const groupId = normalizeKey(item.standard)
    if (scope) {
      const group = scope.get(groupId)
      if (group) group.push(item)
      else scope.set(groupId, [item])
    } else {
      scopes.set(scopeId, new Map([[groupId, [item]]]))
    }
  }

  const groupLevel = (group) => Math.min(...group.map(i => tierLevel(i.tier)))
  const out = []
  for (const scope of scopes.values()) {
    const bestLevel = Math.min(...[...scope.values()].map(groupLevel))
    for (const group of scope.values()) {
      if (groupLevel(group) === bestLevel) out.push(...group)
    }
  }

  return out.sort((a, b) =>
    tierLevel(a.tier) - tierLevel(b.tier)
    || a.standard.localeCompare(b.standard, 'zh-Hans-CN')
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
