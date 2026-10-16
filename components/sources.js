/**
 * 游戏 / 实体 / 来源的唯一定义处（纯常量，零 I/O）
 *
 * 其他模块一律从这里取，不在别处再写字面量。
 */

/** 游戏 ID → 中文名 */
export const GAMES = {
  gi: '原神',
  hsr: '星铁',
  zzz: '绝区零'
}

/** 实体类型 ID → 中文名 */
export const ENTITIES = {
  character: '角色',
  weapon: '武器',
  artifact: '圣遗物'
}

/** 游戏 ID 列表（顺序稳定，供遍历与输出排序） */
export const GAME_IDS = Object.keys(GAMES)
/** 实体 ID 列表（顺序稳定） */
export const ENTITY_IDS = Object.keys(ENTITIES)

/**
 * 别名来源
 *
 * - `miao`  — miao-plugin 的别名文件（原神 / 星铁的角色、武器、圣遗物）
 * - `zzz`   — ZZZ-Plugin 的别名文件（绝区零的角色）
 * - `custom`— 本插件自维护的别名（由其他插件解耦并入，入库）
 *
 * `miao` 与 `zzz` 同为**上游**、只读；`custom` 为本插件自有数据。
 * 冲突时 `custom` 覆盖上游（逐条目判定，见 model/AliasIndex.js）。
 */
export const SOURCES = {
  miao: { id: 'miao', label: 'miao-plugin', priority: 10, upstream: true },
  zzz: { id: 'zzz', label: 'ZZZ-Plugin', priority: 10, upstream: true },
  custom: { id: 'custom', label: '本插件自维护', priority: 20, upstream: false }
}

/** 来源 ID 列表 */
export const SOURCE_IDS = Object.keys(SOURCES)

/** 取来源优先级（未知来源按最低处理） */
export function sourcePriority (id) {
  return SOURCES[id]?.priority ?? 0
}

/** 是否为已知来源 */
export function isKnownSource (id) {
  return Object.prototype.hasOwnProperty.call(SOURCES, id)
}

/** 校验游戏 ID；不合法返回空串 */
export function normalizeGame (id) {
  return Object.prototype.hasOwnProperty.call(GAMES, id) ? id : ''
}

/** 校验实体 ID；不合法返回空串 */
export function normalizeEntity (id) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, id) ? id : ''
}
