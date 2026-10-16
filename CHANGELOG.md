# Changelog

## 0.2.0

- **取消共享别名生成物**：`data/alias.json` / `data/source.json` / 同步脚本全部删除。miao 是基础插件、ZZZ 选装、实例自定义别名各实例不同，别名数据一律**运行期读本机**，不存在"生成一份分发给所有人"这件事。
- 数据分三个**位置**：实例自定义（`miao-plugin/config/alias_{gs,sr}.cfg`，各实例私有）> 仓库自带（`data/aliases.json`）> miao / ZZZ 预设。
- 档次收敛为两档：中文原名 > 外文原名（日文 / 韩文 / 英文原名同级）；取舍顺序固定为**先位置、后档次**，且限定在同一 `(游戏, 实体)` 内。
- 上游读取改为**不按导出名取**（miao 六个文件的导出名混用 `alias`/`abbr`/`setAbbr`/`setAlias`/`artiAbbr`/`artiSetAbbr`/`aliasCfg`），改为合并文件内所有对象导出，`import()` 失败时回退文本解析。
- **不做缓存**：每次查询重新读盘合成（约 782 个原名 / 3771 个关键词 / 77ms），点击即生效，不需要文件监听、也不会返回过期数据；`reload()` 语义等价于重新读一遍。
- 实例自定义 cfg 按 miao 的语义解析：行首允许是原名或已有别名，解析不到的行跳过并计入 `status().unresolvedCustom`。
- 对外接口全部改为 async：`lookup` / `variants` / `list` / `status` / `reload`；候选新增 `position` / `positionLabel`。
- 回归套件重写为 6 套（`normalize` / `alias-sources` / `alias-index` / `service-api` / `app-contract` / `smoke-imports`），上游一律用 `test/.test-tmp/` 夹具，**绝不读写真实 miao / ZZZ 目录**。

## 0.1.1

- 别名数据结构改为**纯边表**：`data/alias.json` 的条目只保留 `canonical / alias / game / entity`，去掉来源字段。
- 优先级改为只按**名字档次**判定：中文原名 > 外文原名；档次属于标准名（正反两行一致），取舍限定在同一 `(游戏, 实体)` 内。
- `lookup` 的候选带 `tier` / `tierLabel` 并按档次排序；`matchedBy` 只表示本次按标准名还是别名命中。
- `list` 改为**按标准名归组**（同一标准名只出现一次，别名为数组）。
- 生成脚本排序去掉来源维度；`source.json` 的 `counts` 改为 `edges` / `canonical` / `customMergedWithUpstream`。

## 0.1.0

- 新建 Alias-Plugin：TRSS-Yunzai 的公共别名服务，把原神 / 星铁 / 绝区零的角色、武器、圣遗物别名收在一处供其它插件查询。
- 数据层：读取 miao-plugin 与 ZZZ-Plugin 的别名文件（均只读），与自维护别名合并。
- 对外查询：`lookup` / `variants` / `list` / `status` / `reload`。
- 归一化只处理「同一个词的不同写法」（空白、间隔号、包裹符号、大小写），保留 `{}` 花括号；不做命令前缀剥离、模糊匹配、目录匹配。
- 降级：数据缺失、结构异常、条目字段非法一律跳过并告警，不抛错、不阻断其它插件加载。
- 回归套件 6 个，任意 cwd 可跑、缺前置跳过。
- 文档：`AGENTS.md` + `docs/`（架构、接口契约、数据与同步、测试、待办与规划）。
