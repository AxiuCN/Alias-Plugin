/**
 * 模块加载冒烟（无前置）
 *
 * 每个模块都要能加载且导出面齐全；加载失败只说明拆分或循环依赖出了问题。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()
const c = checker()

const MODULES = [
  ['components/normalize.js', ['normalizeKey', 'trimKeyword', 'splitAliases']],
  ['components/sources.js', ['GAMES', 'ENTITIES', 'TIERS', 'TIER_IDS', 'GAME_IDS', 'ENTITY_IDS', 'isZhName', 'tierOf', 'tierLevel', 'normalizeGame', 'normalizeEntity']],
  ['components/config.js', ['getPluginConfig', 'pluginRoot', 'configDir']],
  ['model/AliasFile.js', ['resolveDataDir', 'aliasFilePath', 'sourceFilePath', 'readJsonFile', 'readAliasEntries', 'readSourceMeta', 'hasAliasData', 'aliasFileMtime']],
  ['model/AliasIndex.js', ['buildIndex', 'query', 'variantsOf']],
  ['modules/HotReload.js', ['startWatch', 'stopWatch', 'watchState']],
  ['modules/AliasService.js', ['ensureIndex', 'lookup', 'variants', 'list', 'status', 'reload', 'reset', 'stopReload']]
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

// 常量表的取值口径
{
  const { GAMES, ENTITIES, TIERS, TIER_IDS, GAME_IDS, ENTITY_IDS, isZhName, tierOf, tierLevel } = await import(mod('components/sources.js'))
  c.check('三个游戏齐备', GAME_IDS.join(',') === 'gi,hsr,zzz', GAME_IDS.join(','))
  c.check('游戏有中文名', Object.values(GAMES).every(v => typeof v === 'string' && v.length > 0))
  c.check('实体含角色/武器/圣遗物', ['character', 'weapon', 'artifact'].every(k => ENTITIES[k]))
  c.check('档次只有中文原名与外文原名两档', TIER_IDS.join(',') === 'zh-canonical,xx-canonical', TIER_IDS.join(','))
  c.check('中文原名优先级高于外文原名', tierLevel('zh-canonical') < tierLevel('xx-canonical'))
  c.check('档次是标准名的属性，与命中写法无关（tierOf 只吃一个参数）', tierOf.length === 1)
  c.check('中文名判定', isZhName('胡桃') && isZhName('诺姆·霍洛维尔') && !isZhName('{NICKNAME}') && !isZhName('Hu Tao'))
  c.check('占位符标准名判为外文原名', tierOf('{NICKNAME}') === 'xx-canonical')
  c.check('中文标准名判为中文原名', tierOf('旅行者') === 'zh-canonical')
  c.check('档次表带中文标签', Object.values(TIERS).every(t => typeof t.label === 'string' && t.label.length > 0))
}

c.finish()
