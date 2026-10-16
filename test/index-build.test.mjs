/**
 * 索引构建与查询（纯内存，无前置）
 *
 * 覆盖：双向映射、非法条目跳过、同键多命中、来源优先级覆盖、按游戏/实体过滤、变体生成。
 */
import { checker, installFrameworkStubs, mod } from './_helper.mjs'

installFrameworkStubs()
const { buildIndex, query, variantsOf } = await import(mod('model/AliasIndex.js'))

const c = checker()

/** 造一条条目 */
const e = (canonical, alias, game = 'gi', entity = 'character', src = 'miao') =>
  ({ canonical, alias, game, entity, src })

// ---- 双向映射 ----
{
  const idx = buildIndex([e('胡桃', '核桃')])
  c.check('正向：标准名命中别名', query(idx, '胡桃').some(i => i.alias === '核桃'))
  c.check('反向：别名命中标准名', query(idx, '核桃').some(i => i.canonical === '胡桃'))
  c.check('双向展开成 2 条映射', idx.entries.length === 2)
  c.check('索引键数 2（标准名 + 别名各一键）', idx.map.size === 2)
}

// ---- 归一化参与建键 ----
{
  const idx = buildIndex([e('诺姆·霍洛维尔', '诺姆')])
  c.check('带间隔号的标准名可用无间隔号写法命中', query(idx, '诺姆霍洛维尔').length > 0)
  c.check('大小写不敏感', query(idx, 'NORM').length === 0 && query(idx, '诺姆').length > 0)
}

// ---- 非法条目 ----
{
  const idx = buildIndex([
    e('胡桃', '核桃'),
    e('', '空标准名'),
    e('钟离', ''),
    e('温迪', '风神', 'gl', 'character', 'miao'),
    e('可莉', '小太阳', 'gi', 'starship', 'miao'),
    e('迪卢克', '姥爷', 'gi', 'character', 'unknown')
  ])
  c.check('非法游戏 / 实体 / 来源 / 空字段一律跳过', idx.entries.length === 2, `entries=${idx.entries.length}`)
  c.check('跳过数被统计', idx.skipped === 5, `skipped=${idx.skipped}`)
}
{
  const idx = buildIndex([e('胡桃', '胡桃'), e('「胡桃」', '胡桃')])
  c.check('标准名与别名归一后相同 → 跳过，不产生自我映射', idx.entries.length === 0 && idx.skipped === 2, `entries=${idx.entries.length} skipped=${idx.skipped}`)
}

// ---- 同键多命中 ----
{
  const idx = buildIndex([e('胡桃', '桃'), e('桃金娘', '桃', 'gi', 'character')])
  const hits = query(idx, '桃')
  c.check('同优先级下多个标准名共存，取舍归调用方', hits.length === 2, `hits=${hits.length}`)
  c.check('共存结果稳定（两次查询一致）', JSON.stringify(query(idx, '桃')) === JSON.stringify(hits))
}

// ---- 来源优先级：custom 覆盖上游 ----
{
  const idx = buildIndex([e('星见雅', '雅', 'zzz', 'character', 'zzz'), e('雅', '雅珂达', 'zzz', 'character', 'custom')])
  const hits = query(idx, '雅')
  c.check('高优先级来源覆盖低优先级（同 键/游戏/实体）', hits.length === 1 && hits[0].standard === '雅', JSON.stringify(hits.map(h => h.standard)))
  c.check('被覆盖的低优先级项不残留', !hits.some(h => h.standard === '星见雅'))
}
{
  const idx = buildIndex([e('胡桃', '桃'), e('钟离', '桃')])
  c.check('同优先级冲突时两个标准名共存', query(idx, '桃').length === 2)
}

// ---- 游戏 / 实体隔离 ----
{
  const idx = buildIndex([
    e('胡桃', '桃', 'gi', 'character'),
    e('胡桃', '桃', 'hsr', 'character'),
    e('桃', '桃木剑', 'gi', 'weapon')
  ])
  c.check('同别名分属不同游戏时互不干扰', query(idx, '桃').length === 3)
  c.check('按游戏过滤', query(idx, '桃', { game: 'gi' }).length === 2, `gi=${query(idx, '桃', { game: 'gi' }).length}`)
  c.check('按实体过滤', query(idx, '桃', { game: 'gi', entity: 'weapon' }).length === 1)
  c.check('不存在的游戏返回空', query(idx, '桃', { game: 'zzz' }).length === 0)
}

// ---- 变体生成 ----
{
  const idx = buildIndex([e('胡桃', '桃')])
  c.check('命中的别名会带出来', variantsOf(idx, '胡桃').includes('桃'), JSON.stringify(variantsOf(idx, '胡桃')))
  c.check('变体去重且第一个固定为原词', variantsOf(idx, '桃')[0] === '桃' && new Set(variantsOf(idx, '桃')).size === variantsOf(idx, '桃').length)
  c.check('未命中时只回原词', JSON.stringify(variantsOf(idx, '不存在')) === JSON.stringify(['不存在']))
  c.check('空关键词回空数组', variantsOf(idx, '  ').length === 0)
}
{
  const idx = buildIndex([e('胡桃', '桃'), e('胡桃', '核桃')])
  const v = variantsOf(idx, '胡桃')
  c.check('两个别名都进变体', v.length === 3 && v.includes('桃') && v.includes('核桃'), JSON.stringify(v))
  c.check('变体无重复且首项为原词', v[0] === '胡桃' && new Set(v).size === v.length)
}

// ---- 边界 ----
{
  const idx = buildIndex([])
  c.check('空索引不报错', query(idx, '胡桃').length === 0 && idx.entries.length === 0)
  c.check('非数组入参安全', buildIndex(null).entries.length === 0)
  c.check('空关键词不命中', query(idx, '').length === 0)
}

c.finish()
