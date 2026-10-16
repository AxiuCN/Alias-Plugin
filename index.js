/**
 * Alias-Plugin 入口
 *
 * 只做两件事：日志头 → 装配 apps 层。
 * 不含任何业务逻辑：查询在 modules/，数据读在 model/，纯函数在 components/。
 * 别名数据全部在运行期读本机（miao / ZZZ / 实例自定义），入口不做任何数据准备。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

logger?.info('----Alias-Plugin----')
logger?.info('[Alias] 初始化中...')

// ---- 装配 apps 层 ----
const appsDir = path.join(__dirname, 'apps')
let files = []
try {
  files = fs.readdirSync(appsDir).filter(f => f.endsWith('.js') && !f.startsWith('_'))
} catch (err) {
  logger?.error(`[Alias] apps 目录读取失败：${err?.message || err}`)
}

const ret = await Promise.allSettled(files.map(f => import(`./apps/${f}`)))
const apps = {}
for (let i = 0; i < files.length; i++) {
  const name = files[i].replace(/\.js$/, '')
  if (ret[i].status === 'fulfilled') {
    // 单个 app 只导出一个能力类：取默认导出，缺失时回退首个导出
    const mod = ret[i].value
    apps[name] = mod?.default ?? mod?.[Object.keys(mod)[0]]
    logger?.info(`[Alias] 载入: ${name}`)
  } else {
    logger?.error(`[Alias] 载入失败: ${logger?.red?.(name) || name}`)
    logger?.error(ret[i].reason)
  }
}

logger?.info('[Alias] 载入完成')
logger?.info('----Alias-Plugin----')

export { apps }
