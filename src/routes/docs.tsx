import { createFileRoute } from '@tanstack/react-router';
import { envConfigs } from '@/config';

const code = 'overflow-x-auto rounded-xl bg-[#0b2235] p-4 font-mono text-sm text-cyan-50';

function DocsPage() {
  const baseUrl = envConfigs.app_url.replace(/\/$/, '');
  return <main className="min-h-screen bg-[#f4f8f9] px-6 py-12 text-[#10263a]"><article className="mx-auto max-w-4xl space-y-10">
    <header><a href="/" className="text-sm font-bold text-[#087f8c]">← SRA Explorer</a><h1 className="mt-5 text-4xl font-black tracking-tight">API & MCP</h1><p className="mt-3 max-w-2xl text-lg text-slate-600">公开、只读的 SRA 检索接口。网页、API 和 MCP 使用同一套 NCBI/ENA 数据适配器。</p></header>
    <section className="space-y-4"><h2 className="text-2xl font-black">分页检索</h2><p>每次处理 500 个 NCBI SRA 记录。一个记录可能包含多个 run，因此表格新增的 run 行数可能略多于 500。首次请求传查询词，后续请求只传响应中的 <code>nextCursor</code>；不会在后台自动抓取几万条记录。</p><pre className={code}>{`curl '${baseUrl}/api/v1/search?q=SRP043510'`}</pre><pre className={code}>{`curl '${baseUrl}/api/v1/search?cursor=NEXT_CURSOR'`}</pre></section>
    <section className="space-y-4"><h2 className="text-2xl font-black">Run 文件</h2><p>同时返回 NCBI Original submitted files、ENA FASTQ 和 normalized SRA。Original 文件是否存在取决于提交者。收藏工作区可以批量生成 Original URL 清单、带 MD5 校验的 Bash 脚本和 TSV manifest；只有 S3 地址的文件会自动使用 AWS CLI。</p><pre className={code}>{`curl '${baseUrl}/api/v1/runs/SRR12881185/files'`}</pre><pre className={code}>{`curl '${baseUrl}/api/v1/original-files/batch' \\
  -H 'content-type: application/json' \\
  -d '{"accessions":["SRR12881185","SRR14488774"]}'`}</pre><p>OpenAPI 描述位于 <a className="font-bold text-[#087f8c]" href="/api/v1/openapi.json">/api/v1/openapi.json</a>。</p></section>
    <section id="mcp" className="scroll-mt-8 space-y-4"><h2 className="text-2xl font-black">远程 MCP</h2><p>把 Streamable HTTP 地址设为 <code>{baseUrl}/mcp</code>。浏览器打开该地址会来到本说明页；Agent 使用同一地址发送 JSON-RPC POST。服务端不调用模型，也不保存聊天，只暴露只读工具。</p><p>工具包括 <code>search_sra</code>、<code>load_more_results</code>、<code>get_run_files</code> 和 <code>create_download_manifest</code>。</p><pre className={code}>{`{
  "mcpServers": {
    "sra-explorer": { "url": "${baseUrl}/mcp" }
  }
}`}</pre></section>
    <section className="space-y-4"><h2 className="text-2xl font-black">访问策略</h2><p>匿名访问默认每个实例、每个 IP 每分钟 30 次，适合人工浏览和轻量 Agent 使用。部署者可设置 <code>SRA_API_TOKENS</code>（逗号分隔），客户端以 <code>Authorization: Bearer TOKEN</code> 使用较高配额。第一版不包含注册或 Token 自助管理系统。</p></section>
  </article></main>;
}

export const Route = createFileRoute('/docs')({
  head: () => ({ meta: [{ title: 'SRA Explorer NG API & MCP Documentation' }, { name: 'description', content: 'Use the SRA Explorer NG read-only JSON API and remote MCP server to search NCBI SRA and retrieve FASTQ, SRA, and Original submitted files.' }], links: [{ rel: 'canonical', href: `${envConfigs.app_url.replace(/\/$/, '')}/docs` }] }),
  component: DocsPage,
});
