/**
 * 配置读取（三层结构）
 *
 *   defSet/config.yaml          模板（含 ${变量} 占位符与完整注释，锅巴保存时用）
 *   config/config.yaml          运行时（实际读取，不纳入 git）
 *   config/config.yaml.example  参考（手动编辑用户的默认值，纳入 git）
 *
 * 兜底顺序：config.yaml → 从 .example 复制后读取 → .example → 内置默认值。
 * **禁止**解析 defSet 模板过滤占位符——空占位会生成非法 YAML。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
export const pluginRoot = path.resolve(__dirname, '..')
/** 配置目录 */
export const configDir = path.join(pluginRoot, 'config')
const configFile = path.join(configDir, 'config.yaml')
const exampleFile = path.join(configDir, 'config.yaml.example')

/** 内置默认值（config.yaml 与 .example 都读不出来时用） */
const DEFAULT_CONFIG = {
  reload: {
    watch: true,
    debounceMs: 500
  }
}

/** 深合并（嵌套对象逐字段兜底；数组与标量直接覆盖） */
function deepMerge (base, overlay) {
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return { ...base }
  const result = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && base[key] !== null && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

/** 读 YAML 并深合并默认值；失败返回 null */
function readYaml (file) {
  try {
    return deepMerge(DEFAULT_CONFIG, YAML.parse(fs.readFileSync(file, 'utf8')) || {})
  } catch (err) {
    logger?.warn(`[Alias] 配置文件解析失败（${path.basename(file)}）：${err?.message || err}`)
    return null
  }
}

/**
 * 取插件配置
 * config.yaml 不存在时从 .example 复制（首次启动），复制失败则直接读 .example
 * @returns {object}
 */
export function getPluginConfig () {
  if (fs.existsSync(configFile)) return readYaml(configFile) || DEFAULT_CONFIG

  if (fs.existsSync(exampleFile)) {
    try {
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
      fs.copyFileSync(exampleFile, configFile)
      logger?.info('[Alias] 已从 config.yaml.example 创建配置文件')
      return readYaml(configFile) || DEFAULT_CONFIG
    } catch (err) {
      logger?.warn(`[Alias] 创建 config.yaml 失败，直接读取 .example：${err?.message || err}`)
      return readYaml(exampleFile) || DEFAULT_CONFIG
    }
  }

  return DEFAULT_CONFIG
}

export { configFile, exampleFile }
