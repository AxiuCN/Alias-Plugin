# 回归套件

`pnpm test`（= `node test/run.mjs`）——**任意 cwd 可跑**，支持 `--filter=<关键字>` / `--list`。

不启动 bot：直接跑真实生产代码路径；**缺前置打印「跳过」并 exit 0**，断言失败 exit 1。

## 套件

| 套件 | 覆盖 | 前置 |
|------|------|------|
| `normalize.test.mjs` | 归一化与别名串拆分（纯函数） | 无 |
| `index-build.test.mjs` | 索引构建、双向映射、档次取舍、游戏/实体隔离、变体生成 | 无 |
| `data-file.test.mjs` | 数据文件读取与全部降级路径（夹具驱动） | 无 |
| `service-api.test.mjs` | 对外契约：`lookup` 三态、过滤、`variants`、`list`、`status`、`reload` | `data/alias.json` |
| `app-contract.test.mjs` | 分层契约：apps 单类导出、无命令注册、index.js 只装配 | 无 |
| `smoke-imports.test.mjs` | 模块可加载与导出面、常量表口径（档次 / 中文名判定） | 无 |

## 公共设施（`_helper.mjs`）

`pluginRoot` / `appRoot` / `dataDir` / `tmpDir` / `mod()` / `requireAliasData()` / `skip()` /
`checker()` / `installFrameworkStubs()` / `writeFixture()`。

细节见 [`../docs/测试.md`](../docs/测试.md)。
