/**
 * 插件路径推导（纯函数，零 I/O）
 *
 * 一律由 `import.meta.url` 推导，**不用 `process.cwd()`**：cwd 取决于启动方式，
 * 而插件位置是固定的。
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
export const pluginRoot = path.resolve(__dirname, '..')
