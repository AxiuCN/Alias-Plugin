/**
 * 原名、游戏、实体的定义（纯函数与常量，零 I/O）
 *
 * 别名数据的效力来自两个正交维度：
 *   - **位置**（见 model/AliasIndex.js）：实例自定义 > 仓库自带 > miao/ZZZ 预设
 *   - **档次**：同一位置层内，由原名的语言决定的优先序（本文件）
 *
 * 原名只有中文 / 英文 / 日文 / 韩文四种；**日文、韩文、英文优先级一致**，
 * 中文更高一些，因此只有两档：中文原名 > 外文原名。
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

/** 游戏 ID 列表（顺序稳定） */
export const GAME_IDS = Object.keys(GAMES)
/** 实体 ID 列表（顺序稳定） */
export const ENTITY_IDS = Object.keys(ENTITIES)

/** 档次：级别越小越优先（中文更高，其余外文原名同级） */
export const TIERS = {
  'zh-canonical': { id: 'zh-canonical', level: 1, label: '中文原名' },
  'xx-canonical': { id: 'xx-canonical', level: 2, label: '外文原名' }
}

/** 档次 ID 列表（按优先级） */
export const TIER_IDS = Object.keys(TIERS)

/** 中日韩表意文字（含扩展 A 与兼容区） */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 判定原名的档次
 *
 * 原名只有中文 / 英文 / 日文 / 韩文四种；**日文、韩文、英文的优先级一致**，
 * 因此只有两档：含中文（中日韩表意文字）即中文原名，其余一律外文原名。
 * @param {unknown} name
 * @returns {string} 档次 ID
 */
export function tierOf (name) {
  return CJK_RE.test(String(name ?? '')) ? 'zh-canonical' : 'xx-canonical'
}

/**
 * 取档次级别（数值越小越优先；未知档次按最低）
 * @param {string} id
 * @returns {number}
 */
export function tierLevel (id) {
  return TIERS[id]?.level ?? 99
}

/** 校验游戏 ID；不合法返回空串 */
export function normalizeGame (id) {
  return Object.prototype.hasOwnProperty.call(GAMES, id) ? id : ''
}

/** 校验实体 ID；不合法返回空串 */
export function normalizeEntity (id) {
  return Object.prototype.hasOwnProperty.call(ENTITIES, id) ? id : ''
}
