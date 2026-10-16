/**
 * 别名数据热重载
 *
 * 监听 `data/` 目录：目录级监听感知新增 / 替换，文件级轮询兜底（部分平台对
 * 「文件首次创建 / 原子替换」存在感知盲区）。事件触发 → 防抖 → 重建索引。
 *
 * 任一环节失败只告警，不影响插件其余功能；`reload.watch: false` 时完全不挂监听。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getPluginConfig } from '../components/config.js'
import { resolveDataDir } from '../model/AliasFile.js'

/** 文件级轮询间隔（毫秒） */
const WATCH_INTERVAL = 1000

const state = {
  started: false,
  watching: false,
  dir: '',
  timer: null,
  watcher: null
}

/** 监听状态（状态页展示用） */
export function watchState () {
  return { started: state.started, watching: state.watching, dir: state.dir ? path.basename(state.dir) : '' }
}

/**
 * 启动监听（幂等；`reload.watch: false` 时不挂）
 * @param {Function} onReload - 防抖后调用的重建函数
 */
export function startWatch (onReload) {
  if (state.started) return
  state.started = true

  const cfg = getPluginConfig()
  if (cfg?.reload?.watch === false) {
    logger?.info('[Alias] 数据热重载已按配置关闭（reload.watch: false）')
    return
  }

  const dir = resolveDataDir()
  const debounceMs = Number(cfg?.reload?.debounceMs) > 0 ? Number(cfg.reload.debounceMs) : 500
  const schedule = () => {
    if (state.timer) clearTimeout(state.timer)
    state.timer = setTimeout(() => {
      state.timer = null
      try {
        const ret = typeof onReload === 'function' ? onReload() : null
        logger?.info(`[Alias] 别名数据已热重载${ret?.count !== undefined ? `（${ret.count} 条映射）` : ''}`)
      } catch (err) {
        logger?.warn(`[Alias] 别名数据热重载失败，等待下次变更重试：${err?.message || err}`)
      }
    }, debounceMs)
  }

  state.dir = dir
  if (!fs.existsSync(dir)) {
    // 数据目录尚不存在（首次尚未生成）→ 监听其父目录以感知创建
    const parent = path.dirname(dir)
    if (parent !== dir && fs.existsSync(parent)) {
      try {
        state.watcher = fs.watch(parent, { persistent: false }, (_event, filename) => {
          const name = filename ? filename.toString() : ''
          if (name === path.basename(dir) || name.endsWith('.json')) schedule()
        })
      } catch (err) {
        logger?.warn(`[Alias] 监听数据父目录失败，已降级为轮询：${err?.message || err}`)
      }
    }
  } else {
    try {
      state.watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
        const name = filename ? filename.toString() : ''
        if (!name || name.endsWith('.json')) schedule()
      })
    } catch (err) {
      logger?.warn(`[Alias] 监听数据目录失败，已降级为轮询：${err?.message || err}`)
    }
  }

  // 文件级兜底：原子替换 / 首次创建在部分平台上不触发目录事件
  try {
    fs.watchFile(path.join(dir, 'alias.json'), { interval: WATCH_INTERVAL }, (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.size !== prev.size) schedule()
    })
  } catch (err) {
    logger?.warn(`[Alias] 监听别名文件失败，已跳过：${err?.message || err}`)
  }

  state.watching = true
  logger?.info('[Alias] 别名数据热重载已启动（data/）')
}

/** 停止监听（幂等） */
export function stopWatch () {
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
  if (state.watcher) {
    try {
      state.watcher.close()
    } catch { /* 忽略关闭异常 */ }
    state.watcher = null
  }
  if (state.dir) {
    try {
      fs.unwatchFile(path.join(state.dir, 'alias.json'))
    } catch { /* 忽略 */ }
  }
  state.started = false
  state.watching = false
}
