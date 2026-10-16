/**
 * 别名索引（纯内存结构，零 I/O）
 *
 * 数据模型（一层索引 + 一个位置字段，没有多份表）：
 *   `standard`  = { name, aliases:Set, position, game, entity }
 *   位置（position）：**实例自定义(3) > 仓库自带(2) > miao/ZZZ 预设(1)**
 *   档次（tier）  ：由 standard.name 的语言决定，只在同一位置层内部裁决
 *   索引键        ：归一化后的写法 → 该写法指向的 standard 列表
 *
 * 查询取舍，两步且顺序固定：
 *   1. 先按位置：只保留位置最高的那批 standard（实例自定义一票压过预设，与 miao 自身语义一致）
 *   2. 再按档次：同位置批内只保留档次最高的一批（中文原名 > 日文 / 韩文 / 英文原名，后三者同级）
 *   同一 standard 的多个别名**全部保留**；取舍限定在同一 `(游戏, 实体)` 内。
 */
import { normalizeKey } from '../components/normalize.js'
import { normalizeEntity, normalizeGame, tierLevel, tierOf } from '../components/entityNames.js'

/** 位置层级：数值越大越优先 */
export const POSITIONS = {
  preset: 1,
  overlay: 2,
  custom: 3
}

/**
 * 构建索引
 * @param {object} data
 * @param {Array} [data.presets]  - `{ canonical, alias, game, entity }[]`（miao / ZZZ 预设）
 * @param {Array} [data.overlay]  - 同上（仓库自带 data/aliases.json）
 * @param {Array} [data.custom]   - `{ name, aliases, game }[]`（实例自定义，只做位置覆盖）
 * @returns {{map: Map<string, Array>, standards: Array, skipped: number, unresolvedCustom: number}}
 */
export function buildIndex (data) {
  const source = data && typeof data === 'object' ? data : {}
  /** standardId → standard；standardId = 游戏|实体|归一化原名 */
  const standards = new Map()
  /** 预设/自带的别名 → 原名，用于把实例自定义的「标准名或已有别名」解析成原名 */
  const nameIndex = new Map()
  let skipped = 0

  const upsert = (name, game, entity, position) => {
    const id = `${game}|${entity}|${normalizeKey(name)}`
    let standard = standards.get(id)
    if (!standard) {
      standard = { id, name, game, entity, position, tier: tierOf(name), aliases: new Set() }
      standards.set(id, standard)
    } else {
      // 同名原件：位置取高者；位置更高时原名以高位置那份为准（保持显示一致）
      if (position > standard.position) {
        standard.position = position
        standard.name = name
        standard.tier = tierOf(name)
      }
    }
    return standard
  }

  const addAlias = (standard, alias) => {
    const key = normalizeKey(alias)
    if (!key || key === normalizeKey(standard.name)) return
    standard.aliases.add(alias)
  }

  const loadEdgeList = (list, position) => {
    for (const item of Array.isArray(list) ? list : []) {
      const game = normalizeGame(item?.game)
      const entity = normalizeEntity(item?.entity)
      const canonical = String(item?.canonical ?? '').trim()
      const alias = String(item?.alias ?? '').trim()
      if (!game || !entity || !canonical || !alias) {
        skipped++
        continue
      }
      const standard = upsert(canonical, game, entity, position)
      addAlias(standard, alias)
      nameIndex.set(`${game}|${normalizeKey(canonical)}`, standard)
    }
  }

  loadEdgeList(source.presets, POSITIONS.preset)
  loadEdgeList(source.overlay, POSITIONS.overlay)

  // 实例自定义：`name` 允许是标准名或已有别名（与 miao 的 getId 语义一致），解析不到就跳过该行
  let unresolvedCustom = 0
  for (const item of Array.isArray(source.custom) ? source.custom : []) {
    const game = normalizeGame(item?.game)
    const key = normalizeKey(item?.name)
    if (!game || !key) {
      skipped++
      continue
    }
    const standard = nameIndex.get(`${game}|${key}`)
    if (!standard) {
      unresolvedCustom++
      continue
    }
    // 被实例自定义改写过 → 该原名升到实例层（它现在承载着本实例的私有别名）
    standard.position = POSITIONS.custom
    for (const alias of Array.isArray(item?.aliases) ? item.aliases : []) {
      addAlias(standard, alias)
    }
  }

  // 建反向索引：每个写法 → 指向的 standard 列表
  const map = new Map()
  const push = (key, standard) => {
    const list = map.get(key)
    if (list) {
      if (!list.includes(standard)) list.push(standard)
    } else {
      map.set(key, [standard])
    }
  }
  for (const standard of standards.values()) {
    push(normalizeKey(standard.name), standard)
    for (const alias of standard.aliases) push(normalizeKey(alias), standard)
  }

  return { map, standards: [...standards.values()], skipped, unresolvedCustom }
}

/** 分组用 ID */
const scopeOf = (standard) => `${standard.game}|${standard.entity}`
const groupOf = (standard) => `${standard.game}|${standard.entity}|${normalizeKey(standard.name)}`

/**
 * 查询某个写法
 *
 * 同一 standard 只返回一条（别名列表见 `standard.aliases`）；
 * 取舍见文件头注释（先位置、后档次，限定在同一游戏 / 实体内）。
 * @param {object} index
 * @param {string} keyword
 * @param {{game?: string, entity?: string}} [filter]
 * @returns {Array<{standard: object, writer: string, matchedBy: string}>}
 */
export function query (index, keyword, filter = {}) {
  const key = normalizeKey(keyword)
  if (!key || !index?.map) return []
  const game = filter.game ? normalizeGame(filter.game) : ''
  const entity = filter.entity ? normalizeEntity(filter.entity) : ''

  const hits = (index.map.get(key) || []).filter(s =>
    (!game || s.game === game) && (!entity || s.entity === entity))
  if (!hits.length) return []

  // 每个 (游戏, 实体) 内独立取舍
  const scopes = new Map()
  for (const standard of hits) {
    const scopeId = scopeOf(standard)
    const scope = scopes.get(scopeId)
    const groupId = groupOf(standard)
    if (scope) {
      if (!scope.has(groupId)) scope.set(groupId, standard)
    } else {
      scopes.set(scopeId, new Map([[groupId, standard]]))
    }
  }

  const out = []
  for (const scope of scopes.values()) {
    const groups = [...scope.values()]
    // 1. 位置：只留最高位置的那组
    const bestPosition = Math.max(...groups.map(s => s.position))
    const atPosition = groups.filter(s => s.position === bestPosition)
    // 2. 档次：位置层内只留档次最高的**那一组**（不是"各自过线"，否则高档次的会陪着低档次一起留下）
    const bestTier = Math.min(...atPosition.map(s => tierLevel(s.tier)))
    for (const standard of atPosition) {
      if (tierLevel(standard.tier) !== bestTier) continue
      out.push({ standard, writer: keyword, matchedBy: normalizeKey(standard.name) === key ? 'canonical' : 'alias' })
    }
  }

  return out.sort((a, b) =>
    b.standard.position - a.standard.position
    || tierLevel(a.standard.tier) - tierLevel(b.standard.tier)
    || a.standard.name.localeCompare(b.standard.name, 'zh-Hans-CN'))
}

/**
 * 某关键词的全部写法（原词 + 命中标准名的全部别名；第一个固定为原词）
 * @param {object} index
 * @param {string} keyword
 * @param {{game?: string}} [filter]
 * @returns {string[]}
 */
export function variantsOf (index, keyword, filter = {}) {
  const text = String(keyword ?? '').trim()
  if (!text) return []
  const out = [text]
  const seen = new Set([normalizeKey(text)])
  for (const hit of query(index, text, filter)) {
    for (const value of [hit.standard.name, ...hit.standard.aliases]) {
      const key = normalizeKey(value)
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(value)
    }
  }
  return out
}
