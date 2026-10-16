/**
 * 套件公共设施：路径推导 / 前置检查 / 断言计数 / 框架全局桩
 *
 * 约定：
 * - **任意 cwd 可跑**：路径一律由本文件位置推导，不写裸相对字面量、不写盘符绝对路径
 * - **缺前置就跳过、不算失败**：data/alias.json 未生成时打印「跳过」并 exit 0
 * - **不改动数据**：临时产物只写 `test/.test-tmp/`（gitignore）；需要夹具时写进该目录并用
 *   `ALIAS_DATA_DIR` 指向它，绝不碰仓库的 `data/`
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** 套件目录 */
export const testDir = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
export const pluginRoot = path.resolve(testDir, '..')
/** bot 根目录（app/） */
export const appRoot = path.resolve(pluginRoot, '..', '..')
/** 数据目录 */
export const dataDir = path.join(pluginRoot, 'data')
/** 夹具与临时产物目录（gitignore） */
export const tmpDir = path.join(testDir, '.test-tmp')

/**
 * 生产代码的 file URL（套件 import 用，避免写死盘符）
 * @param {string} relPath - 相对插件根，如 'modules/AliasService.js'
 */
export const mod = (relPath) => pathToFileURL(path.join(pluginRoot, relPath)).href

/** 确保临时目录存在并返回 */
export function ensureTmpDir (name = '') {
  const dir = name ? path.join(tmpDir, name) : tmpDir
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** 数据是否已生成 */
export function hasAliasData () {
  return fs.existsSync(path.join(dataDir, 'alias.json'))
}

/** 前置：数据文件 */
export function requireAliasData () {
  if (!hasAliasData()) skip('别名数据未生成（先执行 pnpm sync / node scripts/sync-alias.mjs）')
}

/** 打印「跳过」并正常退出（不算失败） */
export function skip (reason) {
  console.log(`⏭ 跳过：${reason}`)
  process.exit(0)
}

/** 断言计数器 */
export function checker () {
  let pass = 0
  let fail = 0
  return {
    check (name, ok, extra = '') {
      ok ? pass++ : fail++
      console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`)
    },
    counts: () => ({ pass, fail }),
    finish () {
      console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
      process.exit(fail === 0 ? 0 : 1)
    }
  }
}

/** 套件期间收集到的日志 */
export const logs = []

/**
 * 安装框架全局桩（生产代码依赖 bot 注入的 logger）
 * @param {{collect?: boolean, echoError?: boolean}} [opts]
 */
export function installFrameworkStubs (opts = {}) {
  const { collect = true, echoError = false } = opts
  const record = (level) => (...args) => {
    if (collect) logs.push(args)
    if (echoError && level === 'error') console.error('[error]', ...args.map(a => (a && a.stack) || String(a)))
  }
  const paint = () => (v) => String(v ?? '')
  globalThis.logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    mark: record('mark'),
    debug: record('debug'),
    green: paint(), red: paint(), cyan: paint(), yellow: paint(), blue: paint(),
    gray: paint(), magenta: paint(), white: paint(), bold: paint()
  }
}

/**
 * 写一个别名数据夹具，返回其目录（配合 ALIAS_DATA_DIR 使用）
 * @param {string} name - 子目录名
 * @param {{entries?: Array, source?: object, raw?: string}} doc
 */
export function writeFixture (name, doc = {}) {
  const dir = ensureTmpDir(name)
  const aliasFile = path.join(dir, 'alias.json')
  if (doc.raw !== undefined) {
    fs.writeFileSync(aliasFile, doc.raw, 'utf8')
  } else {
    fs.writeFileSync(aliasFile, JSON.stringify({
      version: 1,
      generatedAt: new Date(0).toISOString(),
      entries: doc.entries || []
    }, null, 2), 'utf8')
  }
  if (doc.source) fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(doc.source, null, 2), 'utf8')
  return dir
}
