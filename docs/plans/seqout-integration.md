# seqout 整合计划（暂缓）

- 记录日期：2026-10-08
- 状态：**暂缓**。先把现有的 Explorer（纯前端版）优化好，再回来做这件事。
- 相关代码：`src/features/sra-explorer/discover.tsx`、`src/features/sra-explorer/seqout.ts`、`src/routes/discover.tsx`、`e2e/discover.spec.ts`

## 1. 背景与决定

[seqout.org](https://seqout.org) 是印度理工学院孟买分校 Saket Lab 维护的测序数据集搜索引擎。它索引了 GEO、SRA、ENA、ArrayExpress、DDBJ（DRA/GEA）和中国 GSA，共 100 多万个项目、4000 万个样本。提供按相关性排序的搜索、论文关联、AI 提取的样本特征（组织、细胞类型、疾病等）、REST API 和 MCP。它**只做元数据**，不托管也不下载测序文件。

两者是互补关系：

- **seqout 负责"找"**：跨库搜索、论文关联、样本特征。
- **SRA Explorer 负责"拿"**：实时从 NCBI/ENA 获取 run 列表和文件、Original 文件、收藏、下载脚本、MD5、nf-core 导出。

已经定下的原则：

1. 主页面 `/` 保持"原版 SRA Explorer + 少量增强"的定位，**不直接改动**。整合内容放在独立页面 `/discover` 里。
2. run 列表和下载文件**始终以 NCBI/ENA 为准**。seqout 只做锦上添花，它暂时不可用时，页面也必须能正常工作。
3. 由浏览器直接调用 seqout，不经过我们的服务器转发。转发会把所有访客的请求集中到我们一个 IP 上，碰到它的限额。
4. 页面上注明数据来源（seqout / Saket Lab），AI 提取的字段要明确标注。

## 2. 当前进度

`/discover`（beta）已经写好，并且**已随 2026-10-06 的部署上线**。主页面导航里没有它的入口，只有直接访问 `https://sra.ai2paper.com/discover` 才能进入。

已实现：

| 功能 | 实现方式 |
| --- | --- |
| 关键词搜索，结果是项目卡片 | seqout `/search`，支持物种、测序策略、数据库、长读长、排序，用 `next_cursor` 加载更多 |
| 按 PMID 搜索 | 先查 NCBI 的 elink（pubmed→sra、pubmed→bioproject）；seqout 没有 PMID 接口，所以再用论文标题去 seqout 搜索，按 PMID 精确匹配 |
| 输入编号（GSE/SRP/PRJNA/SRR…） | seqout `/accession/{acc}/project` 反查所属项目，再搜索精确匹配；找不到就显示一个只有编号的卡片 |
| "Show runs" | seqout `/project/{acc}/xref` 把 GEO 编号转换成 SRA 研究编号，然后**从 NCBI 实时拉取 run 列表**（每个项目上限 3000 个） |
| 样本特征列和筛选 | seqout `/project/{SRP}/enriched`，按 SRS 样本编号和 run 对应；表头标 "AI" |
| 论文信息 | 来自 seqout 搜索结果里的 `publications`，标注 "linked by seqout" |
| 收藏 | 和主页面共用（`use-collection.ts`）；导出元数据时多出 `seqout_*` 列（仅当收藏里有带 AI 特征的 run 时才出现） |
| 容错 | seqout 返回的字段先统一规范化（`normalizeProject`）；seqout 宕机时，输入编号仍能从 NCBI 拿到 run |

测试：`e2e/discover.spec.ts` 共 5 个用例，覆盖关键词搜索、PMID、seqout 宕机、和主页面共享收藏、手机端布局；`test/seqout.test.ts` 测字段规范化。

## 3. seqout API 实测记录（2026-10-06）

- 文档：<https://seqout.org/api-docs>；OpenAPI：<https://seqout.org/api/openapi.json>
- 免费、不需要认证，**允许浏览器跨域调用**（会把请求来源回写到 `access-control-allow-origin`）。
- 限额按 IP 计算：一般接口每分钟 60 次，搜索每分钟 30 次，批量和下载接口每分钟 10 次。
- 索引不是实时的：实测时页面显示最近一次刷新是 **2026-04-26**，所以新数据它搜不到。
- 项目页面链接格式是 `https://seqout.org/p/{accession}`（不是 `/project/...`）。
- `/project/{acc}/enriched` 的 `limit` 最大值在 500 到 2000 之间：500 可以，2000 返回 422。现在的代码按每页 500 分页，最多 6 页。
- 样本键：用 SRA 研究编号（SRP）查，键是 SRS，可以直接和 run 对应；用 GEO 编号查，键是 GSM。
- 没有公开的 PMID 查询接口：网站上有 `/pmid/{id}` 页面，但 API 的 `/search` 不支持 `pmid:` 语法。
- 其他可能有用的接口：`/samples/search`（按组织、疾病、细胞类型等跨项目搜样本）、`/search/structured`（`sample_tissue`、`sample_disease` 等筛选条件）、`/project/{study}/runs`（含 SRA Lite 和 GCP 下载地址）、`/project/{acc}/cite`（BibTeX）、GA4GH Beacon。

## 4. 已发现的数据质量问题

这些问题决定了 seqout 只能当参考信息，不能当权威数据：

- **AI 提取的特征会出错**：AG04450（胎儿肺成纤维细胞）被标成"子宫颈、HPV 相关疾病"；同一个 GM12878 样本，按 GEO 编号查是 "Brain"，按 SRA 编号查是 "Peripheral Blood"。
- **论文关联会出错**：SRP182578（杨树 Nanopore 数据）被关联到一篇无关的宏基因组性别鉴定预印本 "SCiMS"。
- **字段类型不严格**：`pub_date` 有时是数字，列表字段有时是 `null`。这曾经导致整个页面白屏，现在已经规范化处理。
- **按引用数排序会牺牲相关性**：搜 "liver cancer scRNA" 并按引用数排序，排第一的是一个甲基化芯片数据集。

## 5. 后续计划（恢复时按顺序做）

### 阶段 A：恢复前的检查

1. 重新实测 seqout API：跨域是否仍然允许、限额、接口和字段有没有变化、索引刷新到了哪天。
2. 阅读 seqout 的使用条款，确认"在另一个网站上实时调用并展示它的数据"是否被允许。
3. 跑一遍 `pnpm test:e2e`，用真实数据手动走一遍 `/discover`。

### 阶段 B：完善 `/discover`

1. **决定是否在主页面加入口**（比如导航里放 "Discover (beta)"）。在此之前先决定 `/discover` 是继续在线上留着，还是暂时下线。
2. **跨项目按样本搜索**：利用 `/samples/search`，比如"所有肝癌、单细胞、人"的样本，直接列出对应的 run。
3. **论文信息**：显示多篇论文（目前只显示第一篇），以及 BibTeX 导出（`/cite`）。
4. **对比 NCBI 自己的元数据**：在样本行里同时显示 NCBI BioSample 的原始属性，方便核对 AI 提取的结果。浏览器可以直接调用 NCBI E-utilities 的 `db=biosample`。
5. **性能**：一个项目有几千个 run 时，表格改用虚拟滚动（目前一次性渲染所有行）。

### 阶段 C：下载端补强（可选）

1. 下载选项里增加 SRA Lite（体积更小）和 Google Cloud 地址，可以参考 seqout 的 `/project/{study}/runs` 返回的字段，或者直接用 NCBI 的接口。
2. 文档里说明分工：找数据用 seqout 的 MCP（`https://seqout.org/api/mcp`），下载和 Original 文件用我们的 MCP。两个 MCP 可以同时装在 Claude 里配合使用。

### 阶段 D：对外

1. 联系 Saket Lab：告知我们在用他们的 API，并提议互相链接（他们不提供 Original 文件下载，正好和我们互补）。
2. 页面和 README 里引用他们的论文（发表后补上）。

## 6. 不做的事

- 不用 seqout 替代 NCBI/ENA 获取 run 列表或下载地址：数据有滞后，而且是第三方服务。
- 不通过我们的服务器转发 seqout 请求（原因见第 1 节第 3 条）。
- 不把 seqout 的功能直接塞进主页面 `/`，除非以后另外决定。
