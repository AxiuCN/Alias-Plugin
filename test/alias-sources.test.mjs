/**
 * 别名来源读取（夹具驱动，无前置）
 *
 * 覆盖：miao 三种导出名（alias / abbr / setAbbr）都要读到、ZZZ 的数组形态、
 * 仓库自带 data/aliases.json、实例自定义 cfg 的解析与「解析不到就跳过」。
 */
import path from 'node:path'
import { checker, clearFixtureTree, installFrameworkStubs, mod, tmpDir, useFixtureTree, writeFixtureTree } from './_helper.mjs'

installFrameworkStubs()
const dirs = writeFixtureTree('sources', {
  presets: {
    'gi/character': { 胡桃: '核桃,桃', 旅行者: '爷' },
    'gi/weapon': { 雾切之回光: '雾切' },
    'gi/artifact': { 炽烈的炎之魔女: '魔女' },
    'hsr/character': { '{NICKNAME}': '开拓者' }
  },
  zzz: { 星见雅: ['雅', '星见'] },
  custom: {
    'alias_gs.cfg': '胡桃：桃胡\n旅行者：空，荧\n坏行没有冒号\n',
    'alias_sr.cfg': '开拓者：穹\n'
  }
})
useFixtureTree(dirs)

const c = checker()
const Sources = await import(mod('model/AliasSources.js'))

// ---- 预设（miao）----
{
  const presets = await Sources.readPresetAliases()
  c.check('miao 目录存在时 loaded.miao 为真', presets.loaded.miao === true)
  c.check('ZZZ 存在时 loaded.zzz 为真', presets.loaded.zzz === true)
  const by = (canonical, alias) => presets.records.some(r => r.canonical === canonical && r.alias === alias)
  c.check('character 的 alias 导出读到', by('胡桃', '核桃') && by('胡桃', '桃'))
  c.check('weapon 的 abbr 导出读到（不按导出名取）', by('雾切之回光', '雾切'))
  c.check('artifact 的 setAbbr 导出读到', by('炽烈的炎之魔女', '魔女'))
  c.check('hsr 的占位符原名读到', by('{NICKNAME}', '开拓者'))
  c.check('ZZZ 的数组形态读到', by('星见雅', '雅') && by('星见雅', '星见'))
  c.check('每条都带 game / entity', presets.records.every(r => r.game && r.entity))
  c.check('zzz 只有角色实体', presets.records.filter(r => r.game === 'zzz').every(r => r.entity === 'character'))
}

// ---- 实例自定义（miao 的 config）----
{
  const custom = Sources.readMiaoCustomAliases()
  c.check('读到 gs / sr 两个 cfg 的可解析行', custom.length === 3, `len=${custom.length}`)
  c.check('多别名按顿号 / 逗号 / 中文逗号都拆开',
    custom.some(x => x.name === '旅行者' && x.aliases.length === 2))
  c.check('带 game', custom.every(x => x.game === 'gi' || x.game === 'hsr'))
  c.check('坏行被跳过（没有冒号的那行）', !custom.some(x => x.name.includes('坏行')))
}

// ---- 仓库自带 ----
{
  const overlay = Sources.readOverlayAliases()
  c.check('仓库自带别名可读', Array.isArray(overlay) && overlay.length > 0, `len=${overlay.length}`)
  c.check('自带别名条目形状齐全', overlay.every(x => x.canonical && x.alias && x.game && x.entity))
}

// ---- 行解析 ----
{
  c.check('中英文冒号都认', Sources.parseCustomLine('胡桃：桃')?.name === '胡桃' && Sources.parseCustomLine('胡桃:桃')?.name === '胡桃')
  c.check('无冒号返回 null', Sources.parseCustomLine('胡桃 桃') === null)
  c.check('只有名字没别名返回 null', Sources.parseCustomLine('胡桃：') === null)
  c.check('空行返回 null', Sources.parseCustomLine('') === null && Sources.parseCustomLine(undefined) === null)
}

// ---- 插件缺失：降级为空，不抛错 ----
{
  // env 指向一个**确实没有**的目录：不该读到任何记录
  clearFixtureTree()
  useFixtureTree({ miao: path.join(tmpDir, 'not-exist-miao'), zzz: path.join(tmpDir, 'not-exist-zzz') })
  const presets = await Sources.readPresetAliases()
  c.check('miao 缺失时返回空记录且不抛错', presets.records.length === 0 && presets.loaded.miao === false, JSON.stringify(presets.loaded))
  c.check('ZZZ 缺失时 loaded.zzz 为假', presets.loaded.zzz === false)
  c.check('无 cfg 时实例自定义为空', Sources.readMiaoCustomAliases().length === 0)
}

clearFixtureTree()
c.finish()
