# 回归套件

`pnpm test`（= `node test/run.mjs`）——**任意 cwd 可跑**，支持 `--filter=<关键字>` / `--list`。

不启动 bot：直接跑真实生产代码路径；**缺前置打印「跳过」并 exit 0**，断言失败 exit 1。

## 套件

| 套件 | 覆盖 | 前置 |
|------|------|------|
| `normalize.test.mjs` | 归一化与别名串拆分（纯函数） | 无 |
| `alias-sources.test.mjs` | 上游读取：三种导出名、ZZZ 数组形态、仓库自带、cfg 解析、缺失降级 | 夹具 |
| `alias-index.test.mjs` | 索引取舍：位置（实例自定义 > 自带 > 预设）→ 档次（中文 > 外文） | 无 |
| `service-api.test.mjs` | 对外契约：`lookup` 三态、实例自定义生效、过滤、`variants`、`list`、`status`、`reload`、降级 | 夹具 |
| `app-contract.test.mjs` | 分层契约：apps 单类导出、无命令注册、只读不写、历史结构不得复活 | 无 |
| `smoke-imports.test.mjs` | 模块可加载与导出面、常量口径 | 无 |

## 公共设施（`_helper.mjs`）

`pluginRoot` / `appRoot` / `tmpDir` / `mod()` / `skip()` / `checker()` /
`installFrameworkStubs()` / `writeFixtureTree()` / `useFixtureTree()` / `clearFixtureTree()`。

上游一律用夹具（`ALIAS_MIAO_DIR` / `ALIAS_ZZZ_DIR` 指向 `test/.test-tmp/`），
**绝不读写真实的 miao / ZZZ 目录**。

细节见 [`../docs/测试.md`](../docs/测试.md)。
