/**
 * miao-plugin 预设别名的文件清单（纯常量，零 I/O）
 *
 * 一个文件 = 一个 (游戏, 实体) 的数据来源，实体由**路径**决定，不写死导出名——
 * 上游各文件的导出名并不统一（`alias` / `abbr` / `setAbbr` / `setAlias` /
 * `artiAbbr` / `artiSetAbbr` / `aliasCfg`），所以读取端用「取文件里所有对象导出并合并」。
 *
 * 路径相对 miao-plugin 根目录；ZZZ-Plugin 只有一个文件，见 ZZZ_ALIAS_FILE。
 */

/** miao-plugin 预设别名文件（基础，人人都有） */
export const MIAO_ALIAS_FILES = [
  { rel: 'resources/meta-gs/character/alias.js', game: 'gi', entity: 'character' },
  { rel: 'resources/meta-gs/weapon/alias.js', game: 'gi', entity: 'weapon' },
  { rel: 'resources/meta-gs/artifact/alias.js', game: 'gi', entity: 'artifact' },
  { rel: 'resources/meta-sr/character/alias.js', game: 'hsr', entity: 'character' },
  { rel: 'resources/meta-sr/weapon/alias.js', game: 'hsr', entity: 'weapon' },
  { rel: 'resources/meta-sr/artifact/alias.js', game: 'hsr', entity: 'artifact' }
]

/** ZZZ-Plugin 预设别名文件（绝区零角色；选装插件，没装就没有 zzz 数据） */
export const ZZZ_ALIAS_FILE = { rel: 'defSet/alias.yaml', game: 'zzz', entity: 'character' }

/** miao-plugin 实例自定义别名文件（**各实例私有**，不入库、不进任何共享数据） */
export const MIAO_CUSTOM_FILES = [
  { rel: 'config/alias_gs.cfg', game: 'gi' },
  { rel: 'config/alias_sr.cfg', game: 'hsr' }
]
