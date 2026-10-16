# Alias-Plugin

> 测试迭代中，暂不可用

TRSS-Yunzai v3 的**公共别名服务**：把原神 / 星铁 / 绝区零的角色、武器、圣遗物别名收在一处，
供其它插件按需查询，不必各自维护一份别名表。

- **只做共享别名能力**：不接管聊天命令、不检查图库目录、不做页面路由、不做业务归一
- 别名数据**运行期从本机读取**：miao / ZZZ 的预设别名 + 本仓库自带别名 + 各实例自己的自定义别名
- 不做缓存、不联网、不需要任何生成步骤；插件缺失或文件损坏时**一律降级**，不阻断其它插件加载

## 安装

插件放在 bot 的 `plugins/Alias-Plugin/`（与其它插件同级），然后重启 bot。
没有依赖安装步骤，也没有需要预先准备的数据文件。

## 查询

```js
import { lookup, variants, list, status } from '../../Alias-Plugin/modules/AliasService.js'

// 关键词 → 原名（exact / ambiguous / none）
await lookup('核桃', { game: 'gi', entity: 'character' })
// → { status: 'exact', canonical: '胡桃', candidates: [...] }

// 关键词的全部写法（供一次搜多个写法）
await variants('胡桃')            // → ['胡桃', '核桃', '桃', ...]

// 条目清单（按原名归组，可按游戏 / 实体过滤）
await list({ game: 'gi', entity: 'weapon', limit: 20 })

// 服务自检
await status()
```

| 参数 | 取值 |
|------|------|
| `game` | `gi`（原神）/ `hsr`（星铁）/ `zzz`（绝区零） |
| `entity` | `character` / `weapon` / `artifact` |
| `status` | `exact`（唯一）/ `ambiguous`（多命中，`candidates` 给出全部）/ `none`（未命中） |
| `tier` | `zh-canonical`（中文原名）/ `xx-canonical`（外文原名） |
| `position` | `custom`（实例自定义）/ `overlay`（本仓库自带）/ `preset`（miao / ZZZ 预设） |

`lookup` **只回事实**：多种命中结果怎么处理（提示、出图、取最优）由调用方决定。

## 优先级

两个维度，顺序固定：

1. **位置**：实例自定义别名（miao 的 `#喵喵别名`）> 本仓库自带别名 > miao / ZZZ 预设
2. **档次**：中文原名 > 外文原名（日文 / 韩文 / 英文同级）

取舍只在同一游戏 / 实体内比较；同位置同档次的多个原名会一起返回。

## 别名数据维护

- **本仓库自带别名**：改 `data/aliases.json`（与预设同名原名时合并别名，不会覆盖预设）
- **预设别名**：miao-plugin 与 ZZZ-Plugin 各自维护，本插件只读
- **自己的私有别名**：用 miao 的 `#喵喵别名设置/删除`，写在 miao 自己的 `config/` 里，运行期即时生效

## 许可

GPL-3.0-only
