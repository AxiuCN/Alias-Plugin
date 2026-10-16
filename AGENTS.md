# AGENTS.md

Alias-Plugin 的项目级指令：为多个业务插件提供**统一的别名查询能力**（TRSS-Yunzai 生态的独立公共别名服务）。

- 仓库：`AxiuCN/Alias-Plugin`
- 边界：**只做共享别名能力**——图库目录检查、页面路由、业务归一、加权评分、用户命令仍归各业务插件
- 不接管聊天命令、不注册定时任务、不做任何写入接口
- 本文件只留快速参考与索引；口径按主题拆进 `docs/`，**按需阅读，别一次全读**
- 用户级与 bot 根项目级指令见 `~/.dsh/AGENTS.md` 与 bot 根 `AGENTS.md`；本文件只覆盖本插件

## 项目概况

- 定位：别名数据层 —— 上游（miao-plugin、ZZZ-Plugin）与本插件自维护的别名合并成一张表，对外开放查询
- 数据格式：JSON；同步脚本：JS（`node scripts/sync-alias.mjs`，可挂 GitHub Action）
- 运行期：**纯文件读取**，不走网络、不依赖 Redis
- ESM（`"type": "module"`），单入口（`index.js` 装配 `apps/`）
- 任务书与首轮只读分析结论见 [`docs/任务书.md`](docs/任务书.md) 与 [`docs/实施与验收.md`](docs/实施与验收.md)（历史留档）

### 快速参考

| 能力 | 出口 | 说明 |
|------|------|------|
| 关键词 → 标准名 | `modules/AliasService.js` 的 `lookup` | `exact` / `ambiguous` / `none` 三态 |
| 关键词的全部写法 | `variants` | 供「一次搜多个写法」的场景 |
| 条目清单 | `list` | 可按游戏 / 实体 / 来源过滤 |
| 服务自检 | `status` | 条数、各游戏与来源占比、数据更新时间、监听状态 |
| 重建索引 | `reload` / `reset` | 数据变更后手动触发（正常由热重载自动完成） |
| 数据生成 | `scripts/sync-alias.mjs` | 读上游 + 合并自维护 → 写 `data/alias.json` + `data/source.json` |

### 当前状态

| 项 | 状态 |
|----|------|
| 源码 | `index.js` + `apps/` + `modules/` + `model/` + `components/` 已落地 |
| 数据 | `data/alias.json` 2438 条映射（gi / hsr / zzz × character / weapon / artifact） |
| `test/` | 6 个套件（normalize / index-build / data-file / service-api / app-contract / smoke-imports） |
| 安装引导机制 | **未开工**（引导单 JS 插件、暂存与发布、状态机） |
| GitHub Action | **未挂**（脚本已提供 `--check`，只比对内容、忽略时间戳） |

## 文档索引（按需阅读，别一次全读）

| 想了解 / 要改的东西 | 先读 |
|---|---|
| 目录分层、数据流、数据文件结构、来源与优先级 | [`docs/架构.md`](docs/架构.md) |
| 查询 API 契约、三态语义、过滤与变体、降级行为 | [`docs/接口契约.md`](docs/接口契约.md) |
| 数据来源与生成脚本、自维护别名的增改、GitHub Action 挂法 | [`docs/数据与同步.md`](docs/数据与同步.md) |
| 回归套件的命令、规范、套件清单 | [`docs/测试.md`](docs/测试.md)、[`test/README.md`](test/README.md) |
| 版本变更记录 | [`CHANGELOG.md`](CHANGELOG.md) |
| 待办与后续（引导安装、Action、其它插件接入） | [`docs/待办与规划.md`](docs/待办与规划.md) |
| 任务书原文（目标 / 边界 / 流程规则） | [`docs/任务书.md`](docs/任务书.md) |
| 审查要点、安装事务与恢复要求、验收矩阵 | [`docs/实施与验收.md`](docs/实施与验收.md) |
| 盘符、部署与本机工作区（**不入库**） | `docs/private/`（新克隆上不存在） |

## 约定

1. **ESM** — 全部 `import` / `export`，不用 `require`
2. **分层不可越界** — `index.js` 只装配 `apps/`；`apps/` 只导出能力类，不写业务逻辑；
   查询在 `modules/`，数据读写在 `model/`，纯函数与常量在 `components/`
3. **路径不写死盘符** — 一律由 `import.meta.url` 推导（`components/config.js` 的 `pluginRoot`）；
   **不要用 `process.cwd()`**
4. **日志** — `logger?.info/warn/error`，标签统一 `[Alias]`；框架等级是 info，**没有 `logger?.debug`**
5. **中文** — 注释、`name` / `dsc`、用户可见文案、文档一律简体中文
6. **降级优先** — 数据缺失 / 解析失败 / 结构异常一律返回「未命中」并 `logger.warn`，绝不抛穿、绝不阻断加载
7. **运行期只读** — 插件运行时**不写任何文件**；数据只有 `scripts/sync-alias.mjs` 会写
8. **不替消费者决定** — 歧义、命中后怎么用、模糊匹配、目录匹配都是调用方的事，服务只回事实
9. **文档必须同步** — 对外契约（API 形状、数据文件结构、来源优先级）变更时同批更新
   `docs/` 对应册、`README.md`、本文件、`CHANGELOG.md`（版本条目），并在发布时同步 `package.json` 的 `version`
10. **不执行 git 操作** — 用户手动提交；改动完成后给提交摘要（`prefix: 中文描述` + `- ` 列表）
11. **不自行发挥** — 只做明确要求的改动；先设计再实现，用户说「分析 / 排查 / 总结」时只分析不写代码

## 硬约束速查（改前必读；细节见 docs）

1. **无命令面** — 本插件不注册 `rule` / `task` / `handler`；`apps/` 下每个文件只导出一个继承 `plugin` 的类
2. **上游只读** — `scripts/sync-alias.mjs` 只读 `plugins/miao-plugin/**` 与 `plugins/ZZZ-Plugin/defSet/alias.yaml`，
   任何情况下不改上游文件
3. **自维护别名合并而非覆盖** — `data/custom.json` 与上游同名时**合并别名串**；
   整体覆盖会丢掉上游已维护的俗称（`旅行者` 曾丢 8 个别名）
4. **`data/alias.json` 不手工编辑** — 它是生成物，重新同步会整体重写；要改数据改 `data/custom.json`
5. **生成必须确定性** — 排序（game → entity → src → 归一键 → 原文）与去重都要稳定；
   `--check` 只比对内容、忽略 `generatedAt`
6. **归一化只管「同一个词」** — 去空白、去间隔号、去包裹符号、小写；
   **不剥离命令前缀、不做简繁转换、不做模糊匹配**
7. **花括号必须保留** — 归一化刻意不去 `{}`（星铁开拓者的标准名是游戏占位符 `{NICKNAME}`）；
   去掉会与上游 `开拓者` 撞键
8. **同一别名多游戏互不干扰** — 覆盖判定按 `(归一键, 游戏, 实体)` 分组；跨游戏共享别名是正常数据
9. **同票共存** — 同优先级下多个标准名指向同一别名时**全部返回**，取舍归调用方
10. **测试不得写 `data/`** — 夹具写 `test/.test-tmp/` 并用 `ALIAS_DATA_DIR` 指向它；
    **断言必须能真的失败**——新增套件先临时改坏代码确认转红，再恢复入库

## 测试

```bash
cd plugins/Alias-Plugin
pnpm test                    # = node test/run.mjs，任意 cwd 可跑
pnpm test -- --list          # 只列套件
pnpm test -- --filter=index  # 只跑文件名含 index 的
```

数据未生成时服务类套件**打印「跳过」并 exit 0**；细节见 [`docs/测试.md`](docs/测试.md)。

## 待办（摘要）

1. **统一安装引导机制**（未开工）：引导单 JS 插件投放到 `plugins/example/`、暂存与发布、状态机与恢复
2. **GitHub Action**：定时比对上游哈希 → 重新生成 → 有变化才提交
3. **其它插件接入**：Atlas（含它缺失的别名套件）、ProfileImg；接入方自行保留目录匹配等专属逻辑
4. **锅巴配置**：`defSet/config.yaml` 与 `config.yaml.example` 已就位，`guoba/` 尚未接入

详见 [`docs/待办与规划.md`](docs/待办与规划.md)。
