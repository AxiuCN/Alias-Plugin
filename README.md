# Alias-Plugin

> 测试迭代中，暂不可用

TRSS-Yunzai v3 的**公共别名服务**：把原神 / 星铁 / 绝区零的角色、武器、圣遗物别名收在一处，
供其它插件按需查询，不必各自维护一份别名表与缓存。

- **只做共享别名能力**：不接管聊天命令、不检查图库目录、不做页面路由、不做业务归一
- 数据由上游（miao-plugin、ZZZ-Plugin）与本插件自维护的别名合并而成，**运行期只读文件、不联网**
- 缺失、解析失败、数据未生成时**一律降级为「未命中」**，不抛错、不阻断其它插件加载

## 安装

插件放在 bot 的 `plugins/Alias-Plugin/`（与其它插件同级），然后重启 bot。

数据文件随仓库分发；若上游别名有更新，在 bot 根目录执行：

```bash
node plugins/Alias-Plugin/scripts/sync-alias.mjs
```

## 查询

```js
import { lookup, variants, list, status } from '../../Alias-Plugin/modules/AliasService.js'

// 关键词 → 标准名（exact / ambiguous / none）
lookup('核桃', { game: 'gi', entity: 'character' })
// → { status: 'exact', canonical: '胡桃', candidates: [...] }

// 关键词的全部写法（供一次搜多个写法）
variants('胡桃')            // → ['胡桃', '核桃', ...]

// 条目清单（可按游戏 / 实体 / 来源过滤）
list({ game: 'gi', entity: 'weapon', limit: 20 })

// 服务自检
status()
```

| 参数 | 取值 |
|------|------|
| `game` | `gi`（原神）/ `hsr`（星铁）/ `zzz`（绝区零） |
| `entity` | `character` / `weapon` / `artifact` |
| `status` | `exact`（唯一）/ `ambiguous`（多命中，`candidates` 给出全部）/ `none`（未命中） |
| `tier` | `zh-canonical`（中文原名）/ `xx-canonical`（外文原名）—— 同一别名指多个标准名时的取舍依据 |

`lookup` **只回事实**：多种命中结果怎么处理（提示、出图、取最优）由调用方决定。
取舍只看**标准名的档次**（中文原名 > 外文原名），且只在同一游戏 / 实体内比较。

## 数据维护

- 自维护别名：改 `data/custom.json`（与上游同名的条目会**合并别名**，不会覆盖上游原有俗称）
- 上游别名：由 `scripts/sync-alias.mjs` 从 miao-plugin / ZZZ-Plugin 读取，只读不改上游
- 生成物 `data/alias.json` 与 `data/source.json` 入库；脚本输出确定性，重复执行不会产生无意义 diff
- 来源（miao / ZZZ / 自维护）只影响生成期合并，**不进入产物、也不参与查询判定**

## 许可

GPL-3.0-only
