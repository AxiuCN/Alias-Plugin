/**
 * 索引构建与查询（纯内存，无前置）
 *
 * 覆盖核心取舍规则：先位置（实例自定义 > 仓库自带 > 预设）、后档次（中文原名 > 外文原名），
 * 同位置同档次的多个原名共存；取舍限定在同一 (游戏, 实体) 内。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()
const { buildIndex, query, variantsOf, POSITIONS } = await import(mod('model/AliasIndex.js'))

const c = checker()

/** 预设边 */
const p = (canonical, alias, game = 'gi', entity = 'character') => ({ canonical, alias, game, entity })

// ---- 双向可查 ----
{
  const idx = buildIndex({ presets: [p('胡桃', '核桃')] })
  c.check('正向：原名命中别名', query(idx, '胡桃').some(h => h.matchedBy === 'canonical'))
  c.check('反向：别名命中原名', query(idx, '核桃').some(h => h.standard.name === '胡桃' && h.matchedBy === 'alias'))
  c.check('同一原名只回一条（别名收进 aliases）', query(idx, '胡桃').length === 1)
  c.check('原名数与关键词数分开记', idx.standards.length === 1 && idx.map.size === 2)
}

// ---- 位置：实例自定义压过预设 ----
{
  const idx = buildIndex({
    presets: [p('胡桃', '桃')],
    custom: [{ name: '旅行者', aliases: ['桃'], game: 'gi' }]
  })
  // 预设里没有「旅行者」这个名字，所以自定义那行解析不到 → 跳过
  c.check('自定义指向未收录的名字时跳过该行', idx.unresolvedCustom === 1 && query(idx, '桃')[0].standard.name === '胡桃')
}
{
  const idx = buildIndex({
    presets: [p('胡桃', '桃'), p('钟离', '岩神')],
    custom: [{ name: '钟离', aliases: ['桃'], game: 'gi' }]
  })
  const hits = query(idx, '桃')
  c.check('实例自定义的别名抢过预设（位置优先）', hits.length === 1 && hits[0].standard.name === '钟离', JSON.stringify(hits.map(h => h.standard.name)))
  c.check('被覆盖的原名仍在表里（只是这个写法不再指向它）', query(idx, '胡桃')[0].standard.name === '胡桃')
  c.check('位置被标为 custom', hits[0].standard.position === POSITIONS.custom)
}
{
  const idx = buildIndex({ presets: [p('胡桃', '桃')], overlay: [p('钟离', '桃')] })
  const hits = query(idx, '桃')
  c.check('仓库自带（overlay）也压过预设', hits.length === 1 && hits[0].standard.name === '钟离')
  c.check('overlay 位置高于 preset', POSITIONS.overlay > POSITIONS.preset)
}

// ---- 档次：中文原名 > 外文原名（日韩英同级）----
{
  const idx = buildIndex({ presets: [p('胡桃', '桃'), p('HuTao', '桃')] })
  const hits = query(idx, '桃')
  c.check('中文原名压过外文原名', hits.length === 1 && hits[0].standard.name === '胡桃', JSON.stringify(hits.map(h => h.standard.name)))
}
{
  const idx = buildIndex({ presets: [p('フータオ', '桃'), p('HuTao', '桃')] })
  c.check('日文原名与英文原名同级 → 共存', query(idx, '桃').length === 2)
}
{
  const idx = buildIndex({ presets: [p('호두', '桃'), p('HuTao', '桃')] })
  c.check('韩文原名与英文原名同级 → 共存', query(idx, '桃').length === 2)
}
{
  const idx = buildIndex({ presets: [p('胡桃', '桃'), p('フータオ', '桃')] })
  c.check('中文 vs 日文：只留中文', query(idx, '桃').every(h => h.standard.name === '胡桃'))
}

// ---- 位置优先于档次 ----
{
  const idx = buildIndex({
    presets: [p('胡桃', '桃'), p('钟离', '岩神')],
    custom: [{ name: '钟离', aliases: ['桃'], game: 'gi' }]
  })
  c.check('位置更高的外文原名也压过位置低的中文原名',
    query(idx, '桃').every(h => h.standard.position === POSITIONS.custom))
}

// ---- 同一原名多个别名 ----
{
  const idx = buildIndex({ presets: [p('胡桃', '桃'), p('胡桃', '核桃')] })
  c.check('同一原名的别名合并到一个 standard', idx.standards.length === 1 && idx.standards[0].aliases.size === 2)
  c.check('变体含原名与两个别名', variantsOf(idx, '胡桃').length === 3, JSON.stringify(variantsOf(idx, '胡桃')))
  c.check('变体首项固定为入参原文', variantsOf(idx, '桃')[0] === '桃')
}
{
  const idx = buildIndex({ presets: [p('胡桃', '胡桃')] })
  c.check('别名与原名归一后相同 → 丢弃，不产生自我映射', idx.standards[0].aliases.size === 0 && query(idx, '胡桃').length === 1)
}

// ---- 游戏 / 实体隔离 ----
{
  const idx = buildIndex({ presets: [p('胡桃', '桃', 'gi'), p('胡桃', '桃', 'hsr')] })
  c.check('跨游戏同名写法互不干扰', query(idx, '桃').length === 2)
  c.check('按游戏过滤', query(idx, '桃', { game: 'gi' }).length === 1)
  c.check('不存在的游戏返回空', query(idx, '桃', { game: 'zzz' }).length === 0)
}
{
  const idx = buildIndex({ presets: [p('桃', '桃木剑', 'gi', 'weapon'), p('胡桃', '桃', 'gi', 'character')] })
  c.check('跨实体互不干扰', query(idx, '桃').length === 2)
  c.check('按实体过滤', query(idx, '桃', { entity: 'character' }).length === 1)
}
{
  // 跨游戏时，中文原名不会吃掉别的游戏里的外文原名（取舍限定在同一 scope 内）
  const idx = buildIndex({ presets: [p('旅行者', '爷', 'gi'), p('{NICKNAME}', '爷', 'hsr')] })
  c.check('跨游戏时各自保留', query(idx, '爷').length === 2, JSON.stringify(query(idx, '爷').map(h => h.standard.name)))
}

// ---- 非法与边界 ----
{
  const idx = buildIndex({
    presets: [
      { canonical: '', alias: '空', game: 'gi', entity: 'character' },
      { canonical: '钟离', alias: '', game: 'gi', entity: 'character' },
      { canonical: '温迪', alias: '风神', game: 'gl', entity: 'character' },
      { canonical: '可莉', alias: '小太阳', game: 'gi', entity: 'starship' }
    ]
  })
  c.check('字段非法一律跳过并计数', idx.standards.length === 0 && idx.skipped === 4, `skipped=${idx.skipped}`)
  c.check('空数据不报错', buildIndex().standards.length === 0 && buildIndex(null).standards.length === 0)
  c.check('空关键词不命中', query(buildIndex({ presets: [p('胡桃', '桃')] }), '').length === 0)
  c.check('空关键词变体为空数组', variantsOf(buildIndex({}), '  ').length === 0)
}

c.finish()
