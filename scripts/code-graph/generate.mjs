import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const platform = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const workspace = dirname(platform),
  contracts = join(workspace, 'poc-contract')
const output = join(platform, 'docs/productization/graph')
mkdirSync(output, { recursive: true })
const ignored = new Set([
  'target',
  'node_modules',
  '.git',
  '.next',
  '.turbo',
  'dist',
  'build',
  'bin',
  'coverage',
  'e2e-report',
  'playwright-report',
  'test-results',
  'storybook-static',
  'out',
  'cache',
  'vendor',
  '.agents',
  '.codex',
])
function files(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((d) =>
    ignored.has(d.name) || d.name.startsWith('.')
      ? []
      : d.isDirectory()
        ? files(join(root, d.name))
        : [join(root, d.name)]
  )
}
const all = files(platform),
  sources = all.filter((p) => /\.([cm]?[jt]sx?)$/.test(p) && !p.endsWith('.d.ts'))
const rel = (p) => relative(workspace, p).replaceAll('\\', '/')
const graph = {
  generatedAt: new Date().toISOString(),
  parsers: { typescript: ts.version, go: 'go/parser (syntax only)', solidity: 'solc compiler AST' },
  nodes: [],
  edges: [],
  issues: [],
  coverage: {},
}
const ids = new Set(),
  edgeIDs = new Set()
function node(n) {
  if (!ids.has(n.id)) {
    ids.add(n.id)
    graph.nodes.push(n)
  }
}
function edge(from, to, kind, resolution = 'ast') {
  const key = JSON.stringify([from, to, kind])
  if (!edgeIDs.has(key)) {
    edgeIDs.add(key)
    graph.edges.push({ from, to, kind, resolution })
  }
}
const paths = {}
for (const p of all.filter((p) => basename(p) === 'package.json')) {
  try {
    const pkg = JSON.parse(readFileSync(p))
    if (pkg.name && existsSync(join(dirname(p), 'src/index.ts')))
      paths[pkg.name] = [join(dirname(p), 'src/index.ts')]
  } catch {}
}
const program = ts.createProgram(sources, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowJs: true,
  jsx: ts.JsxEmit.Preserve,
  skipLibCheck: true,
  baseUrl: platform,
  paths,
})
const checker = program.getTypeChecker(),
  declarations = new Map(),
  pending = []
function isDeclaration(n) {
  return (
    ts.isFunctionDeclaration(n) ||
    ts.isMethodDeclaration(n) ||
    ts.isClassDeclaration(n) ||
    ts.isInterfaceDeclaration(n) ||
    ts.isTypeAliasDeclaration(n) ||
    ts.isEnumDeclaration(n) ||
    ts.isArrowFunction(n) ||
    ts.isFunctionExpression(n)
  )
}
for (const path of sources) {
  const sf = program.getSourceFile(path)
  if (!sf) {
    graph.issues.push(`No TS AST: ${rel(path)}`)
    continue
  }
  const file = rel(path),
    fid = 'file:' + file
  node({ id: fid, kind: 'file', name: basename(path), file, line: 1, language: 'typescript' })
  for (const e of sf.parseDiagnostics ?? [])
    graph.issues.push(`${file}: ${ts.flattenDiagnosticMessageText(e.messageText, ' ')}`)
  function visit(n, owner = fid) {
    let current = owner
    if (isDeclaration(n)) {
      const name =
        n.name?.getText(sf) ??
        (ts.isVariableDeclaration(n.parent) ? n.parent.name.getText(sf) : `anonymous@${n.pos}`)
      const line = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      current = `${file}#${name}@${line}:${n.pos}`
      node({ id: current, kind: ts.SyntaxKind[n.kind], name, file, line, language: 'typescript' })
      declarations.set(n, current)
      edge(owner, current, 'declares')
    }
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const text = n.moduleSpecifier?.text
      if (text) {
        const result = ts.resolveModuleName(
          text,
          path,
          program.getCompilerOptions(),
          ts.sys
        ).resolvedModule
        edge(
          fid,
          result &&
            result.resolvedFileName.startsWith(platform) &&
            !result.resolvedFileName.includes('/node_modules/')
            ? 'file:' + rel(result.resolvedFileName)
            : text,
          'imports',
          result ? 'module-resolution' : 'unresolved'
        )
      }
    }
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      pending.push([
        current,
        n.expression,
        checker.getSymbolAtLocation(
          ts.isPropertyAccessExpression(n.expression) ? n.expression.name : n.expression
        ),
        sf,
      ])
    }
    ts.forEachChild(n, (c) => visit(c, current))
  }
  visit(sf)
}
for (const [owner, expr, symbol, sf] of pending) {
  let s = symbol
  try {
    if (s?.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s)
  } catch {}
  const d = s?.declarations?.find((d) => declarations.has(d))
  edge(
    owner,
    d ? declarations.get(d) : expr.getText(sf).slice(0, 180),
    'calls',
    d ? 'symbol' : 'syntactic'
  )
}
const go = JSON.parse(
  execFileSync('go', ['run', join(platform, 'scripts/code-graph/go-ast.go'), platform], {
    env: { ...process.env, GOCACHE: process.env.GOCACHE ?? '/tmp/stablenet-review-go-build' },
    maxBuffer: 100 * 1024 * 1024,
  })
)
go.nodes.forEach(node)
go.edges.forEach((e) => edge(e.from, e.to, e.kind, e.resolution))
graph.issues.push(...go.issues)
const solcIDs = new Map(),
  asts = new Map(),
  solPending = []
const compilerASTs = JSON.parse(
  execFileSync('python3', [join(platform, 'scripts/code-graph/solidity-ast.py'), contracts], {
    maxBuffer: 100 * 1024 * 1024,
  })
)
for (const [path, ast] of Object.entries(compilerASTs)) asts.set(path, ast)
for (const [path, ast] of asts) {
  const absolute = join(contracts, path),
    file = rel(absolute),
    fid = 'file:' + file
  const source = readFileSync(absolute, 'utf8')
  node({ id: fid, kind: 'file', name: basename(path), file, line: 1, language: 'solidity' })
  function visit(n, owner = fid) {
    if (!n || typeof n !== 'object') return
    let current = owner
    if (
      n.nodeType &&
      [
        'ContractDefinition',
        'FunctionDefinition',
        'ModifierDefinition',
        'StructDefinition',
        'EnumDefinition',
        'EventDefinition',
        'ErrorDefinition',
      ].includes(n.nodeType)
    ) {
      const offset = Number(n.src.split(':')[0])
      const line = Buffer.from(source).subarray(0, offset).toString().split('\n').length
      const name = n.name || n.kind || n.nodeType
      current = `${file}#${name}@${n.id}`
      node({ id: current, kind: n.nodeType, name, file, line, language: 'solidity' })
      solcIDs.set(n.id, current)
      edge(owner, current, 'declares')
    }
    if (n.nodeType === 'ImportDirective')
      edge(fid, 'file:' + rel(join(contracts, n.absolutePath)), 'imports')
    if (n.nodeType === 'FunctionCall') {
      const expr = n.expression
      solPending.push([
        current,
        expr?.referencedDeclaration,
        expr?.name || expr?.memberName || expr?.nodeType,
        'calls',
      ])
    }
    if (n.nodeType === 'InheritanceSpecifier')
      solPending.push([
        current,
        n.baseName?.referencedDeclaration,
        n.baseName?.namePath,
        'inherits',
      ])
    for (const [k, v] of Object.entries(n)) {
      if (k === 'documentation') continue
      if (Array.isArray(v)) v.forEach((x) => visit(x, current))
      else if (v && typeof v === 'object') visit(v, current)
    }
  }
  visit(ast)
}
for (const [from, id, name, kind] of solPending)
  edge(
    from,
    solcIDs.get(id) ?? String(name ?? id),
    kind,
    solcIDs.has(id) ? 'declaration-reference' : 'external-or-builtin'
  )
const rust = JSON.parse(
  execFileSync(
    'cargo',
    [
      'run',
      '--quiet',
      '--offline',
      '--manifest-path',
      join(platform, 'scripts/code-graph/rust-ast/Cargo.toml'),
      '--',
      platform,
    ],
    {
      maxBuffer: 50 * 1024 * 1024,
      env: {
        ...process.env,
        CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? '/tmp/stablenet-rust-ast-target',
      },
    }
  )
)
rust.nodes.forEach(node)
rust.edges.forEach((e) => edge(e.from, e.to, e.kind, e.resolution))
graph.issues.push(...rust.issues)
graph.parsers.rust = 'syn (syntax only; macros are invocation edges, not expanded)'
const solidityFiles = (root) =>
  readdirSync(root, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? solidityFiles(join(root, d.name))
      : d.name.endsWith('.sol')
        ? [join(root, d.name)]
        : []
  )
const solFiles = solidityFiles(join(contracts, 'src'))
const missing = solFiles.filter((p) => !asts.has(relative(contracts, p)))
graph.coverage = {
  typescriptFiles: sources.length,
  rustFiles: rust.nodes.filter((n) => n.kind === 'file').length,
  goFiles: go.nodes.filter((n) => n.kind === 'file').length,
  solidityFiles: asts.size,
  soliditySourceFiles: solFiles.length,
  solidityMissing: missing.map(rel),
}
if (missing.length)
  graph.issues.push(
    'Solidity excluded profiles are listed in coverage.solidityMissing; no fabricated AST edges.'
  )
graph.nodes.sort((a, b) => a.id.localeCompare(b.id))
graph.edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
const fingerprint = createHash('sha256')
for (const n of graph.nodes
  .filter((n) => n.kind === 'file')
  .sort((a, b) => a.file.localeCompare(b.file))) {
  fingerprint.update(n.file)
  fingerprint.update('\0')
  fingerprint.update(readFileSync(join(workspace, n.file)))
  fingerprint.update('\0')
}
graph.sourceFingerprint = fingerprint.digest('hex')
writeFileSync(join(output, 'code-graph.json'), JSON.stringify(graph))
const groups = new Map()
for (const n of graph.nodes.filter((n) => n.kind === 'file')) {
  const p = n.file.split('/')
  const group =
    p[0] === 'poc-contract'
      ? p.slice(0, 3).join('/')
      : p[1] === 'packages' && p[2] === 'sdk-ts'
        ? p.slice(0, 4).join('/')
        : p.slice(0, 3).join('/')
  const row = groups.get(group) ?? { files: 0, symbols: 0 }
  row.files++
  row.symbols += graph.nodes.filter((x) => x.file === n.file && x.kind !== 'file').length
  groups.set(group, row)
}
writeFileSync(
  join(output, 'INVENTORY.md'),
  `# AST 코드 목록\n\n생성: ${graph.generatedAt}\n\nTypeScript ${sources.length}, Go ${graph.coverage.goFiles}, Rust ${graph.coverage.rustFiles}, Solidity ${asts.size}/${solFiles.length} 파일. 동적 호출은 syntactic으로 표기하며 증명된 호출 관계로 취급하지 않는다.\n\n| 영역 | 파일 | 선언 |\n|---|---:|---:|\n` +
    [...groups]
      .sort()
      .map(([g, v]) => `| ${g} | ${v.files} | ${v.symbols} |`)
      .join('\n') +
    `\n\n문제/제외 목록:\n${graph.issues.map((x) => '- ' + x).join('\n') || '없음'}\n`
)
// File-level graph is embedded for an offline, dependency-free searchable viewer.
const fileNodes = graph.nodes.filter((n) => n.kind === 'file')
const index = new Map(graph.nodes.map((n) => [n.id, n.file]))
const fileEdges = [
  ...new Set(
    graph.edges
      .filter(
        (e) =>
          ids.has(e.to) &&
          e.resolution !== 'syntactic' &&
          ['imports', 'calls', 'inherits'].includes(e.kind)
      )
      .map((e) => JSON.stringify(['file:' + index.get(e.from), 'file:' + index.get(e.to)]))
  ),
]
  .map(JSON.parse)
  .filter(([a, b]) => a !== b)
const data = JSON.stringify({ nodes: fileNodes, edges: fileEdges }).replaceAll('<', '\\u003c')
writeFileSync(
  join(output, 'explorer.html'),
  `<!doctype html><meta charset="utf-8"><title>StableNet 코드 그래프</title><style>body{font:16px system-ui;margin:32px;background:#101927;color:#e0e8f4}input{padding:12px;width:60%;border:1px solid #64748b;border-radius:6px}button{display:block;color:#b8e5ff;background:#1d3048;border:0;padding:10px;margin:4px;cursor:pointer;text-align:left;width:95%}main{display:grid;grid-template-columns:1fr 1fr;gap:24px}small{color:#a3b5c9}#list{max-height:80vh;overflow:auto}</style><h1>StableNet 코드 그래프</h1><p>AST 기반 파일 의존 관계 · 선언/호출 상세는 code-graph.json · 동적 호출은 확정 관계에 포함하지 않음</p><input id="search" placeholder="서비스, 파일명, 모듈 검색"><main><div id="list"></div><section id="detail">파일을 선택하면 들어오는/나가는 연결을 확인할 수 있습니다.</section></main><script>const graph=${data};const names=new Map(graph.nodes.map(n=>[n.id,n]));function item(id){const b=document.createElement('button');b.textContent=names.get(id)?.file||id;b.onclick=()=>show(id);return b}function show(id){const d=document.getElementById('detail');d.replaceChildren();const h=document.createElement('h2');h.textContent=names.get(id).file;d.append(h);draw(d,id);for(const [label,match,other]of[['사용하는 파일',0,1],['사용하는 곳',1,0]]){const h=document.createElement('h3');h.textContent=label;d.append(h);for(const e of graph.edges.filter(e=>e[match]===id))d.append(item(e[other]))}}function draw(parent,id){const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 680 500');svg.setAttribute('role','img');svg.setAttribute('aria-label','선택한 파일의 의존 그래프');const incoming=graph.edges.filter(e=>e[1]===id).map(e=>e[0]),outgoing=graph.edges.filter(e=>e[0]===id).map(e=>e[1]);const nodes=[...new Set([...incoming,...outgoing])].slice(0,16);function label(key,x,y,color){const g=document.createElementNS(ns,'g'),c=document.createElementNS(ns,'circle'),t=document.createElementNS(ns,'text');c.setAttribute('cx',x);c.setAttribute('cy',y);c.setAttribute('r',key===id?16:9);c.setAttribute('fill',color);t.setAttribute('x',x);t.setAttribute('y',y+25);t.setAttribute('text-anchor','middle');t.setAttribute('fill','#e0e8f4');t.setAttribute('font-size','10');t.textContent=names.get(key)?.file.split('/').slice(-2).join('/').slice(-32);g.append(c,t);g.style.cursor='pointer';g.onclick=()=>show(key);svg.append(g)}nodes.forEach((key,i)=>{const a=i*2*Math.PI/nodes.length,x=340+245*Math.cos(a),y=245+190*Math.sin(a),line=document.createElementNS(ns,'line');line.setAttribute('x1','340');line.setAttribute('y1','245');line.setAttribute('x2',x);line.setAttribute('y2',y);line.setAttribute('stroke',incoming.includes(key)?'#fbbf24':'#38bdf8');svg.append(line);label(key,x,y,incoming.includes(key)?'#fbbf24':'#38bdf8')});label(id,340,245,'#a78bfa');parent.append(svg);const p=document.createElement('p');p.textContent='노랑: 이 파일을 사용하는 곳 · 파랑: 이 파일이 사용하는 곳 · 최대 16개 표시';parent.append(p)}function render(){const q=search.value.toLowerCase();list.replaceChildren(...graph.nodes.filter(n=>n.file.toLowerCase().includes(q)).slice(0,250).map(n=>item(n.id)))}search.oninput=render;render()</script>`
)
console.log(
  JSON.stringify(
    {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      coverage: graph.coverage,
      issues: graph.issues.length,
    },
    null,
    2
  )
)

if (graph.issues.length || missing.length) process.exitCode = 1
