/**
 * 模块加载冒烟（无前置）
 *
 * 每个模块都要能加载且导出面齐全；常量表口径一并守。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()
const c = checker()

const MODULES = [
  ['components/normalize.js', ['normalizeKey', 'trimKeyword', 'splitAliases']],
  ['components/entityNames.js', ['GAMES', 'ENTITIES', 'TIERS', 'TIER_IDS', 'GAME_IDS', 'ENTITY_IDS', 'tierOf', 'tierLevel', 'normalizeGame', 'normalizeEntity']],
  ['components/config.js', ['pluginRoot']],
  ['model/UpstreamFiles.js', ['MIAO_ALIAS_FILES', 'ZZZ_ALIAS_FILE', 'MIAO_CUSTOM_FILES']],
  ['model/AliasSources.js', ['botRoot', 'miaoRoot', 'zzzRoot', 'overlayFilePath', 'readJsAliasFile', 'readYamlAliasFile', 'readOverlayAliases', 'readMiaoCustomAliases', 'readPresetAliases', 'parseCustomLine']],
  ['model/AliasIndex.js', ['POSITIONS', 'buildIndex', 'query', 'variantsOf']],
  ['modules/AliasService.js', ['ensureIndex', 'lookup', 'variants', 'list', 'status', 'reload', 'TIERS', 'POSITIONS']]
]

for (const [file, exports] of MODULES) {
  let m = null
  try {
    m = await import(mod(file))
  } catch (err) {
    c.check(`${file} 可加载`, false, err?.message || String(err))
    continue
  }
  c.check(`${file} 可加载`, true)
  const missing = exports.filter(name => m[name] === undefined)
  c.check(`${file} 导出面齐全`, missing.length === 0, missing.length ? `缺少 ${missing.join(', ')}` : '')
}

// ---- 常量口径 ----
{
  const { GAMES, ENTITIES, TIERS, TIER_IDS, GAME_IDS, ENTITY_IDS, tierOf, tierLevel } = await import(mod('components/entityNames.js'))
  c.check('三个游戏齐备', GAME_IDS.join(',') === 'gi,hsr,zzz', GAME_IDS.join(','))
  c.check('游戏有中文名', Object.values(GAMES).every(v => typeof v === 'string' && v.length > 0))
  c.check('实体含角色/武器/圣遗物', ['character', 'weapon', 'artifact'].every(k => ENTITIES[k]))
  c.check('档次只有两档', TIER_IDS.join(',') === 'zh-canonical,xx-canonical', TIER_IDS.join(','))
  c.check('中文原名优先级更高', tierLevel('zh-canonical') < tierLevel('xx-canonical'))
  c.check('中文名判为中文原名', tierOf('胡桃') === 'zh-canonical' && tierOf('诺姆·霍洛维尔') === 'zh-canonical')
  c.check('日文 / 韩文 / 英文原名同档', tierOf('フータオ') === 'xx-canonical' && tierOf('호두') === 'xx-canonical' && tierOf('Hu Tao') === 'xx-canonical')
  c.check('游戏占位符是外文原名', tierOf('{NICKNAME}') === 'xx-canonical')
  c.check('档次表带中文标签', Object.values(TIERS).every(t => typeof t.label === 'string' && t.label.length > 0))
}
{
  const { POSITIONS } = await import(mod('model/AliasIndex.js'))
  c.check('位置三级且顺序正确', POSITIONS.custom > POSITIONS.overlay && POSITIONS.overlay > POSITIONS.preset)
}
{
  const { MIAO_ALIAS_FILES, ZZZ_ALIAS_FILE, MIAO_CUSTOM_FILES } = await import(mod('model/UpstreamFiles.js'))
  c.check('miao 预设 6 个文件', MIAO_ALIAS_FILES.length === 6)
  c.check('miao 预设含两个游戏的三个实体',
    new Set(MIAO_ALIAS_FILES.map(f => `${f.game}/${f.entity}`)).size === 6)
  c.check('ZZZ 只有绝区零角色', ZZZ_ALIAS_FILE.game === 'zzz' && ZZZ_ALIAS_FILE.entity === 'character')
  c.check('实例自定义是 gs / sr 两个 cfg', MIAO_CUSTOM_FILES.map(f => f.rel).join(',') === 'config/alias_gs.cfg,config/alias_sr.cfg')
}

c.finish()
