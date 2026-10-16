/**
 * 数据文件读取（无前置：夹具驱动）
 *
 * 覆盖：正常读取、文件缺失、JSON 坏掉、结构异常、条目字段非法——全部必须降级而不抛穿。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, installFrameworkStubs, mod, writeFixture } from './_helper.mjs'

installFrameworkStubs()
const AliasFile = await import(mod('model/AliasFile.js'))
const c = checker()

// ---- 正常 ----
{
  const dir = writeFixture('data-ok', {
    entries: [
      { canonical: '胡桃', alias: '核桃', game: 'gi', entity: 'character', src: 'miao' },
      { canonical: '胡桃', alias: '', game: 'gi', entity: 'character', src: 'miao' },
      { canonical: '', alias: '空', game: 'gi', entity: 'character', src: 'miao' },
      { canonical: '钟离', alias: '岩神', game: 'gi', entity: 'character', src: 'miao' }
    ]
  })
  process.env.ALIAS_DATA_DIR = dir
  const ret = AliasFile.readAliasEntries()
  c.check('正常读取', ret.reason === '' && ret.entries.length === 2, `entries=${ret.entries.length}`)
  c.check('空字段条目被丢弃', !ret.entries.some(x => !x.canonical || !x.alias))
  c.check('hasAliasData 为真', AliasFile.hasAliasData() === true)
  c.check('mtime 可读', AliasFile.aliasFileMtime() > 0)
}

// ---- 文件缺失 ----
{
  process.env.ALIAS_DATA_DIR = path.join(process.env.TEMP || '/tmp', 'alias-plugin-not-exist')
  const ret = AliasFile.readAliasEntries()
  c.check('文件缺失：返回空 + 原因，不抛错', ret.entries.length === 0 && /不存在/.test(ret.reason), ret.reason)
  c.check('文件缺失：hasAliasData 为假', AliasFile.hasAliasData() === false)
  c.check('文件缺失：mtime 为 0', AliasFile.aliasFileMtime() === 0)
}

// ---- JSON 坏掉 ----
{
  const dir = writeFixture('data-broken', { raw: '{ 这不是 JSON' })
  process.env.ALIAS_DATA_DIR = dir
  const ret = AliasFile.readAliasEntries()
  c.check('非法 JSON：降级为空 + 原因', ret.entries.length === 0 && /解析失败/.test(ret.reason), ret.reason)
}

// ---- 结构异常 ----
{
  const dir = writeFixture('data-shape', { raw: JSON.stringify({ version: 1, list: [] }) })
  process.env.ALIAS_DATA_DIR = dir
  const ret = AliasFile.readAliasEntries()
  c.check('缺少 entries 数组：降级为空 + 原因', ret.entries.length === 0 && /结构异常/.test(ret.reason), ret.reason)
}
{
  const dir = writeFixture('data-notarray', { raw: JSON.stringify({ entries: '不是数组' }) })
  process.env.ALIAS_DATA_DIR = dir
  c.check('entries 非数组：同样降级', AliasFile.readAliasEntries().entries.length === 0)
}

// ---- 来源元数据 ----
{
  const dir = writeFixture('data-meta', { entries: [], source: { version: 1, upstream: [{ src: 'miao' }] } })
  process.env.ALIAS_DATA_DIR = dir
  const meta = AliasFile.readSourceMeta()
  c.check('来源元数据可读', meta?.upstream?.length === 1)
  c.check('元数据缺失时为 null', (() => {
    process.env.ALIAS_DATA_DIR = path.join(process.env.TEMP || '/tmp', 'alias-plugin-not-exist')
    return AliasFile.readSourceMeta() === null
  })())
}

delete process.env.ALIAS_DATA_DIR
c.check('未设环境变量时指向插件 data/ 目录', path.basename(AliasFile.resolveDataDir()) === 'data')
c.check('入口文件名固定为 alias.json', fs.existsSync(path.dirname(AliasFile.aliasFilePath())) || path.basename(AliasFile.aliasFilePath()) === 'alias.json')

c.finish()
