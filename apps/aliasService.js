/**
 * 公共别名服务（apps 层能力出口）
 *
 * 本插件不接管任何聊天命令：这个类让服务随框架加载被装配一次，
 * 并把查询能力挂到实例上（业务插件也可以直接 `import` modules 调用）。
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
  }
}

export default AliasService
