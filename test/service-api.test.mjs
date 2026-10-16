/**
 * 服务对外契约（前置：data/alias.json 已生成；缺失则跳过）
 *
 * 只测对外行为：命中 / 歧义 / 未命中三种状态、过滤、变体、清单、状态自检。
 */
import { checker, installFrameworkStubs, mod, requireAliasData } from './_helper.mjs'

installFrameworkStubs()
requireAliasData()

const service = await import(mod('modules/AliasService.js'))
const c = checker()

const status = service.status()
c.check('数据非空', status.entries > 0, `entries=${status.entries} / keywords=${status.keywords}`)
c.check('三种来源齐备或至少含上游与自维护之一', Object.keys(status.bySrc).length >= 1, JSON.stringify(status.bySrc))
c.check('状态不含服务器绝对路径', !JSON.stringify(status).includes(':\\') && !JSON.stringify(status).includes('/plugins/'))

// ---- 命中 ----
{
  const ret = service.lookup('胡桃')
  c.check('标准名精确命中', ret.status === 'exact' && ret.canonical === '胡桃', `${ret.status}/${ret.canonical}`)
  c.check('命中结果带候选明细', Array.isArray(ret.candidates) && ret.candidates.length >= 1)
  c.check('候选带来源与匹配方式', ret.candidates[0].src !== '' && ['canonical', 'alias'].includes(ret.candidates[0].matchedBy))
}
{
  const ret = service.lookup('核桃')
  c.check('别名反查标准名', ret.candidates.some(x => x.canonical === '胡桃'), `${ret.status}/${JSON.stringify(ret.candidates.map(x => x.canonical))}`)
  c.check('反查时 matchedBy 标为 alias', ret.candidates.find(x => x.canonical === '胡桃')?.matchedBy === 'alias')
}

// ---- 未命中 ----
{
  const ret = service.lookup('这个别名一定不存在xyz')
  c.check('未命中：status=none 且候选为空', ret.status === 'none' && ret.canonical === null && ret.candidates.length === 0)
  c.check('未命中仍回归一化键', typeof ret.normalized === 'string')
}
c.check('空关键词未命中且不报错', service.lookup('').status === 'none')
c.check('undefined 关键词未命中且不报错', service.lookup(undefined).status === 'none')

// ---- 过滤 ----
{
  // 「主角」在原神（旅行者）与星铁（{NICKNAME}）都有，正好用来验游戏隔离
  const all = service.lookup('主角')
  const gi = service.lookup('主角', { game: 'gi' })
  const hsr = service.lookup('主角', { game: 'hsr' })
  c.check('跨游戏查询可多命中', all.status !== 'none', `${all.status}×${all.candidates.length}`)
  c.check('限定游戏后候选都在该游戏内', gi.candidates.every(x => x.game === 'gi') && hsr.candidates.every(x => x.game === 'hsr'))
  c.check('限定实体后候选都在该实体内', service.lookup('雾切之回光', { entity: 'weapon' }).candidates.every(x => x.entity === 'weapon'))
  c.check('非法游戏值被忽略（回落到不过滤）', service.lookup('胡桃', { game: '不存在' }).status === 'exact')
}

// ---- variants ----
{
  const v = service.variants('胡桃')
  c.check('变体含原词且去重', v[0] === '胡桃' && new Set(v).size === v.length, JSON.stringify(v))
  c.check('变体可用于搜到同一实体', v.length >= 2)
  c.check('未命中关键词只回原词', JSON.stringify(service.variants('不存在xyz')) === JSON.stringify(['不存在xyz']))
}

// ---- list ----
{
  const giChar = service.list({ game: 'gi', entity: 'character' })
  c.check('清单按游戏/实体过滤', giChar.length > 0 && giChar.every(x => x.game === 'gi' && x.entity === 'character'))
  c.check('清单可限条数', service.list({ limit: 5 }).length === 5)
  c.check('清单来源过滤', service.list({ src: 'custom' }).every(x => x.src === 'custom'))
  c.check('清单是副本（改动不污染索引）', (() => {
    const a = service.list({ limit: 1 })
    a[0].canonical = '被改坏了'
    return service.list({ limit: 1 })[0].canonical !== '被改坏了'
  })())
}

// ---- reload / reset ----
{
  const before = service.status().entries
  const ret = service.reload()
  c.check('reload 返回条数且不改变数据', ret.ok && ret.count === before, `count=${ret.count}`)
  service.reset()
  c.check('reset 后查询仍可用（自动重建）', service.lookup('胡桃').status === 'exact')
  c.check('reload 计数被统计', service.status().stats.reloads >= 1)
}

// ---- 降级：数据目录为空 ----
{
  process.env.ALIAS_DATA_DIR = (await import('node:path')).join(process.env.TEMP || '/tmp', 'alias-plugin-empty-xyz')
  service.reset()
  const ret = service.lookup('胡桃')
  c.check('数据缺失时查询返回未命中而不抛错', ret.status === 'none')
  c.check('数据缺失时 status.ok 为假且带原因', service.status().ok === false && service.status().error !== '')
  delete process.env.ALIAS_DATA_DIR
  service.reset()
}

service.stopReload()
c.finish()
