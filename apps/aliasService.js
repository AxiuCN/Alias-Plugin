/**
 * 公共别名服务（apps 层能力出口）
 *
 * 本插件不接管任何聊天命令：这个类只做两件事——
 *   1. 让服务在框架加载插件时被装配一次（与其它插件同批 load）；
 *   2. 把查询能力挂到实例上，业务插件既可 `import` modules 直接调用，
 *      也可从 `Bot` 的插件列表里按 `name`（`Alias别名服务`）取到本实例。
 *
 * 无 `rule` / `task` / `handler`：不响应消息、不注册定时任务。
 */
import plugin from '../../../lib/plugins/plugin.js'
import * as service from '../modules/AliasService.js'

export class AliasService extends plugin {
  constructor () {
    super({
      name: 'Alias别名服务',
      dsc: '公共别名查询服务（多游戏 / 多实体，不接管聊天命令）',
      event: 'message',
      priority: 5000,
      rule: []
    })

    /** 查询能力（与 modules/AliasService.js 的导出一致） */
    this.lookup = service.lookup
    this.variants = service.variants
    this.list = service.list
    this.status = service.status
    this.reload = service.reload

    // 装配即预热：首次建索引失败只降级，不阻断插件加载
    try {
      const st = service.status()
      if (!st.ok) {
        logger?.warn(`[Alias] 别名数据不可用（${st.error || '无数据'}），查询将一律返回未命中；请执行 pnpm sync 生成 data/alias.json`)
      }
    } catch (err) {
      logger?.warn(`[Alias] 别名服务初始化失败（不影响其它插件）：${err?.message || err}`)
    }
  }
}

export default AliasService
