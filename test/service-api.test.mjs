/**
 * 服务对外契约（夹具驱动，无前置）
 *
 * 重点守两件事：
 *   1. 实例自定义别名（miao 的 config）在运行期生效，且**只来自本机**；
 *   2. 插件缺失 / 数据异常时降级为空表，不抛错、不阻断。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, clearFixtureTree, installFrameworkStubs, mod, pluginRoot, tmpDir, useFixtureTree, writeFixtureTree } from './_helper.mjs'

installFrameworkStubs()
const overlayFile = path.join(pluginRoot, 'data', 'aliases.json')
const dirs = writeFixtureTree('service', {
  presets: {
    'gi/character': { 胡桃: '核桃,桃', 旅行者: '爷,主' },
    'gi/weapon': { 雾切之回光: '雾切' },
    'hsr/character': { '{NICKNAME}': '开拓者' }
  },
  zzz: { 星见雅: ['雅'] },
  custom: { 'alias_gs.cfg': '胡桃：往生堂主\n旅行者：空\n' }
})
useFixtureTree(dirs)

const service = await import(mod('modules/AliasService.js'))
const c = checker()

// ---- 状态 ----
{
  const st = await service.status()
  c.check('数据非空', st.standards > 0, `standards=${st.standards} / keywords=${st.keywords} / aliases=${st.aliases}`)
  c.check('三个游戏都在', ['gi', 'hsr', 'zzz'].every(g => st.byGame[g] > 0), JSON.stringify(st.byGame))
  c.check('三个实体都在', ['character', 'weapon', 'artifact'].every(e => e in st.byEntity), JSON.stringify(st.byEntity))
  c.check('档次只有两档', Object.keys(st.byTier).every(k => ['zh-canonical', 'xx-canonical'].includes(k)), JSON.stringify(st.byTier))
  c.check('位置分布含实例自定义与仓库自带', st.byPosition.custom > 0 && st.byPosition.overlay > 0, JSON.stringify(st.byPosition))
  c.check('miao / zzz 都标记为已加载', st.loaded.miao === true && st.loaded.zzz === true)
  c.check('状态不含服务器绝对路径', !JSON.stringify(st).includes(':\\') && !JSON.stringify(st).includes('/plugins/'))
}

// ---- 命中 / 反查 / 未命中 ----
{
  const hit = await service.lookup('胡桃')
  c.check('原名精确命中', hit.status === 'exact' && hit.canonical === '胡桃')
  c.check('候选带档次；位置标为 custom（该原名被实例自定义改写过）',
    hit.candidates[0].tier === 'zh-canonical' && hit.candidates[0].tierLabel === '中文原名'
    && hit.candidates[0].positionLabel === 'custom')
  const back = await service.lookup('核桃')
  c.check('别名反查原名', back.status === 'exact' && back.canonical === '胡桃' && back.candidates[0].matchedBy === 'alias')
  c.check('未命中：none 且候选为空', (await service.lookup('绝对不存在的写法xyz')).status === 'none')
  c.check('空关键词不报错', (await service.lookup('')).status === 'none' && (await service.lookup(undefined)).status === 'none')
}

// ---- 实例自定义别名：运行期生效，且只来自本机 ----
{
  const hit = await service.lookup('往生堂主')
  c.check('实例自定义别名生效', hit.status === 'exact' && hit.canonical === '胡桃', JSON.stringify(hit.candidates))
  c.check('该条目的位置被标为 custom（实例私有）', hit.candidates[0].positionLabel === 'custom')
  const st = await service.status()
  c.check('实例自定义条数被单独计数，不与预设混同', st.counts.custom === 2 && st.counts.preset > 0, JSON.stringify(st.counts))
}
{
  // 同一个写法：预设指向 A、实例自定义指向 B → 实例自定义赢
  const dirs2 = writeFixtureTree('service-override', {
    presets: { 'gi/character': { 胡桃: '桃', 钟离: '岩神' } },
    custom: { 'alias_gs.cfg': '钟离：桃\n' }
  })
  useFixtureTree(dirs2)
  const hit = await service.lookup('桃')
  c.check('实例自定义抢过预设的别名', hit.status === 'exact' && hit.canonical === '钟离', JSON.stringify(hit.candidates))
  c.check('原名本身仍可查', (await service.lookup('胡桃')).canonical === '胡桃')
  useFixtureTree(dirs)
}

// ---- 仓库自带别名（data/aliases.json）----
{
  const hit = await service.lookup('开拓者')
  c.check('仓库自带别名生效', hit.candidates.some(x => x.canonical === '{NICKNAME}'), JSON.stringify(hit.candidates.map(x => x.canonical)))
  c.check('自带别名的位置标为 overlay', hit.candidates.find(x => x.canonical === '{NICKNAME}')?.positionLabel === 'overlay')
}

// ---- 过滤 / 变体 / 清单 ----
{
  c.check('按游戏过滤', (await service.lookup('雅', { game: 'zzz' })).status === 'exact')
  c.check('限定到别的游戏就查不到', (await service.lookup('雅', { game: 'gi' })).status === 'none')
  c.check('非法游戏值被忽略（退化为不过滤）', (await service.lookup('胡桃', { game: '不存在' })).status === 'exact')
}
{
  const v = await service.variants('胡桃')
  c.check('变体含原名、预设别名、实例自定义别名', ['胡桃', '核桃', '桃', '往生堂主'].every(x => v.includes(x)), JSON.stringify(v))
  c.check('变体去重且首项为原词', v[0] === '胡桃' && new Set(v).size === v.length)
  c.check('未命中只回原词', JSON.stringify(await service.variants('不存在xyz')) === JSON.stringify(['不存在xyz']))
}
{
  const giChar = await service.list({ game: 'gi', entity: 'character' })
  c.check('清单按原名归组', giChar.every(x => typeof x.canonical === 'string' && Array.isArray(x.alias)))
  c.check('同一原名只出现一次', new Set(giChar.map(x => x.canonical)).size === giChar.length)
  c.check('清单带档次与位置', giChar.every(x => x.tier && typeof x.position === 'number'))
  c.check('清单可限条数', (await service.list({ limit: 2 })).length === 2)
  c.check('清单是副本（改动 alias 数组不污染索引）', await (async () => {
    const a = await service.list({ limit: 5 })
    const target = a.find(x => x.canonical === '胡桃')
    target.alias.push('被塞进来的')
    const again = (await service.list({ limit: 5 })).find(x => x.canonical === '胡桃')
    return !again.alias.includes('被塞进来的')
  })())
}

// ---- reload：语义上就是重新读盘（不做缓存）----
{
  const before = await service.status()
  const ret = await service.reload()
  c.check('reload 返回原名数且不改变数据', ret.ok && ret.count === before.standards, `count=${ret.count}`)
  const after = await service.status()
  c.check('reload 计数被统计', after.stats.rebuilds > before.stats.rebuilds, `rebuilds ${before.stats.rebuilds} → ${after.stats.rebuilds}`)
  c.check('overlay 文件确实存在（供上面断言）', fs.existsSync(overlayFile))
}

// ---- 降级：miao / ZZZ 都缺失（只剩仓库自带别名，不抛错、不阻断）----
{
  clearFixtureTree()
  useFixtureTree({ miao: path.join(tmpDir, 'not-exist-miao'), zzz: path.join(tmpDir, 'not-exist-zzz') })
  const st = await service.status()
  c.check('两个上游都缺失：预设条数为 0、loaded 全为假',
    st.counts.preset === 0 && st.loaded.miao === false && st.loaded.zzz === false, JSON.stringify(st.counts))
  c.check('两个上游都缺失：仍能用仓库自带别名查到名字', st.counts.overlay > 0 && (await service.lookup('开拓者')).status !== 'none')
  c.check('两个上游都缺失：预设独有的名字查不到', (await service.lookup('胡桃')).status === 'none')
  c.check('两个上游都缺失：不抛错、status 仍可读', typeof st.ok === 'boolean' && typeof st.keywords === 'number')
}

clearFixtureTree()
c.finish()
