# Changelog

## 0.1.0

- 新建 Alias-Plugin：TRSS-Yunzai 的公共别名服务，把原神 / 星铁 / 绝区零的角色、武器、圣遗物别名收在一处供其它插件查询。
- 数据层：读取 miao-plugin 的 6 个别名文件与 ZZZ-Plugin 的 `defSet/alias.yaml`（均只读），与自维护别名合并生成 `data/alias.json`（2438 条映射）与记录上游指纹的 `data/source.json`。
- 自维护别名放 `data/custom.json`，与上游同名标准名时**合并别名串**而非整体覆盖，避免丢掉上游已维护的俗称。
- 对外查询：`lookup`（`exact` / `ambiguous` / `none` 三态，歧义把候选全给出）、`variants`（关键词的全部写法）、`list`、`status`、`reload`。
- 归一化只处理「同一个词的不同写法」（空白、间隔号、包裹符号、大小写），保留 `{}` 花括号；不做命令前缀剥离、模糊匹配、目录匹配。
- 降级：数据缺失、JSON 结构异常、条目字段非法一律返回「未命中」并告警，不抛错、不阻断其它插件加载。
- 索引同步构建（无 await 窗口），避免并发首次查询读到半成品；`data/` 变更由目录与文件双监听防抖重建。
- 数据生成脚本 `scripts/sync-alias.mjs`（确定性输出，`--check` 幂等比对，供 GitHub Action 使用）。
- 回归套件 6 个（归一化、索引构建、数据读取、对外契约、分层契约、加载冒烟），任意 cwd 可跑、缺前置跳过。
- 文档：`AGENTS.md` + `docs/`（架构、接口契约、数据与同步、测试、待办与规划），`defSet/` 与 `config/config.yaml.example` 提供配置三层结构。
