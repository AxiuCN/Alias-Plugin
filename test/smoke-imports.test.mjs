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
  ['components/sources.js', ['GAMES', 'ENTITIES', 'SOURCES', 'GAME_IDS', 'ENTITY_IDS', 'SOURCE_IDS', 'sourcePriority', 'normalizeGame', 'normalizeEntity']],
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
  const { GAMES, ENTITIES, SOURCES, GAME_IDS, ENTITY_IDS, SOURCE_IDS, sourcePriority } = await import(mod('components/sources.js'))
  c.check('三个游戏齐备', GAME_IDS.join(',') === 'gi,hsr,zzz', GAME_IDS.join(','))
  c.check('游戏有中文名', Object.values(GAMES).every(v => typeof v === 'string' && v.length > 0))
  c.check('实体含角色/武器/圣遗物', ['character', 'weapon', 'artifact'].every(k => ENTITIES[k]))
  c.check('来源含 miao / zzz / custom', ['miao', 'zzz', 'custom'].every(k => SOURCES[k]))
  c.check('custom 优先级高于上游', sourcePriority('custom') > sourcePriority('miao') && sourcePriority('miao') === sourcePriority('zzz'))
  c.check('来源 ID 列表与定义一致', SOURCE_IDS.length === Object.keys(SOURCES).length && ENTITY_IDS.length === 3)
}

c.finish()
