/**
 * 套件公共设施：路径推导 / 夹具 / 断言计数 / 框架全局桩
 *
 * 约定：
 * - **任意 cwd 可跑**：路径一律由本文件位置推导，不写裸相对字面量、不写盘符绝对路径
 * - **缺前置就跳过、不算失败**：没有可用夹具 / 数据时打印「跳过」并 exit 0
 * - **不改动真实插件目录**：夹具一律写 `test/.test-tmp/`，并用
 *   `ALIAS_MIAO_DIR` / `ALIAS_ZZZ_DIR` 指向它；**绝不写别的插件的 config**
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
/** 夹具与临时产物目录（gitignore） */
export const tmpDir = path.join(testDir, '.test-tmp')

/**
 * 生产代码的 file URL（套件 import 用，避免写死盘符）
 * @param {string} relPath - 相对插件根，如 'modules/AliasService.js'
 */
export const mod = (relPath) => pathToFileURL(path.join(pluginRoot, relPath)).href

/** 确保临时目录存在并返回（同名夹具先清空，避免上一轮的残留文件影响断言） */
export function ensureTmpDir (name = '') {
  const dir = name ? path.join(tmpDir, name) : tmpDir
  if (name) fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
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

/** 安装框架全局桩（生产代码依赖 bot 注入的 logger） */
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

/* ============================================================
 *  夹具：造一个假的 miao-plugin / ZZZ-Plugin 目录树
 * ============================================================ */

/** miao 预设别名文件（与真实布局一致） */
const MIAO_FILES = [
  ['resources/meta-gs/character/alias.js', 'gi', 'character'],
  ['resources/meta-gs/weapon/alias.js', 'gi', 'weapon'],
  ['resources/meta-gs/artifact/alias.js', 'gi', 'artifact'],
  ['resources/meta-sr/character/alias.js', 'hsr', 'character'],
  ['resources/meta-sr/weapon/alias.js', 'hsr', 'weapon'],
  ['resources/meta-sr/artifact/alias.js', 'hsr', 'artifact']
]

/** 上游导出名并不统一；夹具混用几种，用来守「不按导出名取」的行为 */
const EXPORT_BY_ENTITY = { character: 'alias', weapon: 'abbr', artifact: 'setAbbr' }

/** 把 `{ 标准名: 别名串 }` 渲染成 miao 风格的 JS 文件内容 */
function renderMiaoFile (table, exportName) {
  const body = Object.entries(table)
    .map(([name, aliases]) => `  ${JSON.stringify(name)}: ${JSON.stringify(aliases)},`)
    .join('\n')
  return `// 套件夹具\nexport const ${exportName} = {\n${body}\n}\n`
}

/**
 * 写一套夹具并返回其根目录
 *
 * @param {string} name - 夹具子目录名
 * @param {object} [opts]
 * @param {object} [opts.presets] - `{ 'gi/character': { 标准名: '别名串' } }`（不给的组合就是空文件）
 * @param {object} [opts.zzz]     - `{ 标准名: ['别名'] }`；不给则不建 ZZZ 目录
 * @param {object} [opts.custom]  - `{ 'alias_gs.cfg': '标准名：别名' }`；写进 miao 的 config 目录
 * @param {boolean} [opts.noMiao] - 完全不建 miao 目录
 * @returns {{miao: string, zzz: string}} 夹具根目录
 */
export function writeFixtureTree (name, opts = {}) {
  const base = ensureTmpDir(name)
  const miao = path.join(base, 'miao-plugin')
  const zzz = path.join(base, 'ZZZ-Plugin')

  if (!opts.noMiao) {
    for (const [rel, game, entity] of MIAO_FILES) {
      const file = path.join(miao, rel)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      const table = opts.presets?.[`${game}/${entity}`] || {}
      fs.writeFileSync(file, renderMiaoFile(table, EXPORT_BY_ENTITY[entity]), 'utf8')
    }
    fs.mkdirSync(path.join(miao, 'config'), { recursive: true })
    for (const [file, content] of Object.entries(opts.custom || {})) {
      fs.writeFileSync(path.join(miao, 'config', file), content, 'utf8')
    }
  }

  if (opts.zzz) {
    fs.mkdirSync(path.join(zzz, 'defSet'), { recursive: true })
    const lines = Object.entries(opts.zzz)
      .map(([canonical, aliases]) => `${canonical}:\n${aliases.map(a => `  - ${a}`).join('\n')}`)
      .join('\n')
    fs.writeFileSync(path.join(zzz, 'defSet', 'alias.yaml'), `${lines}\n`, 'utf8')
  }

  return { miao, zzz }
}

/** 把夹具目录设为当前进程的 miao / ZZZ 根 */
export function useFixtureTree (dirs = {}) {
  if (dirs.miao) process.env.ALIAS_MIAO_DIR = dirs.miao
  else delete process.env.ALIAS_MIAO_DIR
  if (dirs.zzz) process.env.ALIAS_ZZZ_DIR = dirs.zzz
  else delete process.env.ALIAS_ZZZ_DIR
}

/** 清掉夹具环境变量 */
export function clearFixtureTree () {
  delete process.env.ALIAS_MIAO_DIR
  delete process.env.ALIAS_ZZZ_DIR
}
