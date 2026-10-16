/**
 * 游戏 / 实体 / 名字档次的唯一定义处（纯常量与纯函数，零 I/O）
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
 * 名字档次（唯一的优先级依据）
 *
 * 数值越小越优先，**只看标准名是中文还是外文**，不看它来自哪个来源、
 * 也不看本次是按标准名还是按别名命中的：
 *
 *   1. `zh-canonical` 中文原名——中文标准名
 *   2. `xx-canonical` 外文原名——非中文标准名
 *
 * 别名（任何非标准名的写法）参与竞争时，用它指向的**标准名**的档次。
 */
export const TIERS = {
  'zh-canonical': { id: 'zh-canonical', level: 1, label: '中文原名' },
  'xx-canonical': { id: 'xx-canonical', level: 2, label: '外文原名' }
}

/** 档次 ID 列表（按优先级） */
export const TIER_IDS = Object.keys(TIERS)

/** 是否含中日韩表意文字 */
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

/**
 * 判断一个名字是否算「中文原名」
 * @param {unknown} value
 * @returns {boolean}
 */
export function isZhName (value) {
  return CJK_RE.test(String(value ?? ''))
}

/**
 * 取**标准名**的档次
 *
 * 档次描述的是「标准名本身是中文还是外文」，与它由哪个写法命中无关——
 * 查别名时同样按被指向的标准名分档（`matchedBy` 另行说明是按标准名还是别名命中的）。
 * @param {string} canonical - 标准名
 * @returns {string} 档次 ID
 */
export function tierOf (canonical) {
  return isZhName(canonical) ? 'zh-canonical' : 'xx-canonical'
}

/**
 * 取档次等级（数值越小越优先；未知档次按最低）
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
