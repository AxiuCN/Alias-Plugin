/**
 * apps/ 层与入口的装配契约（无前置：静态 + 模块加载）
 *
 * 本插件不接管聊天命令，因此这里守的是**结构契约**：
 *   1. 每个 apps/ 文件恰好导出一个类（框架按导出注册，多导出会顶掉类）；
 *   2. 能力类不注册命令 / 定时任务；
 *   3. index.js 只做装配，不含查询与文件写入。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, installFrameworkStubs, mod, pluginRoot } from './_helper.mjs'

installFrameworkStubs()
const c = checker()

// ---- 每个 app 恰好一个类导出 ----
const appsDir = path.join(pluginRoot, 'apps')
const appFiles = fs.readdirSync(appsDir).filter(f => f.endsWith('.js'))
c.check('apps/ 下有且仅有能力出口文件', appFiles.length >= 1, appFiles.join(','))

for (const file of appFiles) {
  const src = fs.readFileSync(path.join(appsDir, file), 'utf8')
  const classes = [...src.matchAll(/export\s+class\s+([A-Za-z0-9_$]+)/g)].map(m => m[1])
  const defaultExport = /export\s+default\s+/.test(src)
  c.check(`${file}：只导出一个类`, classes.length === 1, classes.join(','))
  c.check(`${file}：带默认导出（index.js 的取值口径）`, defaultExport)
  c.check(`${file}：不注册 rule / task / handler`, !/\brule\s*:/.test(src.replace(/rule:\s*\[\s*\]/, '')) && !/\btask\s*:/.test(src) && !/\bhandler\s*:/.test(src))
  c.check(`${file}：继承框架 plugin 基类`, /import\s+plugin\s+from\s+'\.\.\/\.\.\/\.\.\/lib\/plugins\/plugin\.js'/.test(src))
}

// ---- 能力类可导入（不实例化，避免依赖框架构造） ----
for (const file of appFiles) {
  const m = await import(mod(`apps/${file}`))
  const cls = m.default
  c.check(`${file}：可导入且有 prototype`, typeof cls === 'function' && !!cls.prototype, typeof cls)
  c.check(`${file}：类名以大写开头（PascalCase）`, /^[A-Z]/.test(cls.name), cls.name)
}

// ---- index.js 只做装配 ----
{
  const src = fs.readFileSync(path.join(pluginRoot, 'index.js'), 'utf8')
  c.check('index.js 装配 apps/', /readdirSync\(appsDir\)/.test(src) && /import\(`\.\/apps\//.test(src))
  c.check('index.js 导出 { apps }', /export\s*\{\s*apps\s*\}/.test(src))
  c.check('index.js 不写文件', !/writeFileSync|appendFileSync|renameSync|rmSync/.test(src))
  c.check('index.js 不含查询逻辑', !/lookup\(|variants\(/.test(src))
  c.check('index.js 不 import model 层', !/from\s+'\.\/model\//.test(src))
}

// ---- modules 层不越界 ----
{
  const serviceSrc = fs.readFileSync(path.join(pluginRoot, 'modules/AliasService.js'), 'utf8')
  c.check('服务不写文件（无写入接口）', !/writeFileSync|appendFileSync|renameSync|mkdirSync/.test(serviceSrc))
  c.check('服务不注册命令 / 任务', !/rule\s*:/.test(serviceSrc) && !/cron\s*:/.test(serviceSrc))
  c.check('服务不 import 框架 plugin 基类', !/lib\/plugins\/plugin\.js/.test(serviceSrc))

  const hotSrc = fs.readFileSync(path.join(pluginRoot, 'modules/HotReload.js'), 'utf8')
  c.check('热重载只读监听，不写数据', !/writeFileSync|renameSync/.test(hotSrc))
}

c.finish()
