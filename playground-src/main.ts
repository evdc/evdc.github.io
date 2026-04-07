import './styles.css'

import { basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

import { compile, type CheckResult } from '@elysium/compiler'
import type { Declaration } from '@elysium/compiler'
import {
  CountOp,
  FilterOp,
  JoinOp,
  ProjectOp,
  SumOp,
  applyZSet,
  changeRecordsToZSets,
  createRuntime,
  synthDelta,
  type RuntimeTraceEntry,
} from '@elysium/runtime'
import { createPlatform, reconcileList } from '@elysium/platform'

import defaultSource from './chat.ely?raw'

type RuntimeLike = ReturnType<typeof createRuntime>
type PlatformLike = ReturnType<typeof createPlatform>

type CompiledModule = {
  rt: RuntimeLike
  platform: PlatformLike
}

let editor: EditorView
let unmountCurrent: (() => void) | null = null
let traceUnsub: (() => void) | null = null
let activeRuntime: RuntimeLike | null = null
const MAX_TRACE = 400
let traceBuffer: RuntimeTraceEntry[] = []

const editorHost = mustElement('editor')
const previewHost = mustElement('preview-root')
const compileButton = mustElement('compile-button') as HTMLButtonElement
const resetButton = mustElement('reset-button') as HTMLButtonElement
const status = mustElement('status')

editor = new EditorView({
  parent: editorHost,
  state: EditorState.create({
    doc: defaultSource,
    extensions: [
      basicSetup,
      oneDark,
      javascript({ typescript: false }),
      EditorView.theme({
        '&': { height: '100%' },
        '.cm-scroller': { overflow: 'auto' },
      }),
    ],
  }),
})

compileButton.addEventListener('click', () => {
  compileAndRender()
})

resetButton.addEventListener('click', () => {
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: defaultSource },
  })
  setStatus('Source reset. Press Compile to rebuild preview.', false)
})

const traceLog = mustElement('trace-log')
const clearTraceButton = mustElement('clear-trace-button') as HTMLButtonElement

clearTraceButton.addEventListener('click', () => {
  traceBuffer = []
  activeRuntime?.clearTraceLog()
  renderTraceLog()
})

compileAndRender()

function compileAndRender(): void {
  const source = editor.state.doc.toString()

  teardownPreview(previewHost)

  let result
  try {
    result = compile(source)
  } catch (err) {
    setStatus(formatCompileException(err, source), true)
    return
  }
  if (!result.ok) {
    setStatus(formatDiagnostics(result.diagnostics), true)
    return
  }

  try {
    const mod = runCompiled(result.js)
    const rootView = pickRootView(result.ast)
    if (!rootView) {
      setStatus('Compile succeeded, but no view declarations were found to mount.', true)
      return
    }
    activeRuntime = mod.rt
    traceBuffer = mod.rt.getTraceLog().slice(-MAX_TRACE)
    renderTraceLog()
    traceUnsub = mod.rt.onTrace((entry) => {
      traceBuffer.push(entry)
      if (traceBuffer.length > MAX_TRACE) {
        traceBuffer = traceBuffer.slice(traceBuffer.length - MAX_TRACE)
      }
      renderTraceLog()
    })

    const mount = mod.platform.mount(previewHost, (p) => p.createComponent(rootView, {}))
    unmountCurrent = mount

    const warnings = result.diagnostics.warnings.length
    const warningLine = warnings > 0 ? `\nWarnings: ${warnings}` : ''
    setStatus(`Compiled and mounted ${rootView}.${warningLine}`, false)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    setStatus(`Runtime error while loading compiled output:\n${message}`, true)
  }
}

function formatCompileException(err: unknown, source: string): string {
  const msg = err instanceof Error ? err.message : String(err)
  const line = typeof err === 'object' && err && 'line' in err ? Number((err as any).line) : NaN
  const col = typeof err === 'object' && err && 'col' in err ? Number((err as any).col) : NaN
  if (!Number.isFinite(line) || !Number.isFinite(col)) return `Compile failed:\n${msg}`

  const lines = source.split('\n')
  const text = lines[line - 1] ?? ''
  const caret = `${' '.repeat(Math.max(0, col - 1))}^`
  return `Compile failed at ${line}:${col}\n${msg}\n\n${text}\n${caret}`
}

function teardownPreview(preview: HTMLElement): void {
  if (traceUnsub) {
    traceUnsub()
    traceUnsub = null
  }
  activeRuntime = null
  traceBuffer = []
  renderTraceLog()

  if (unmountCurrent) {
    unmountCurrent()
    unmountCurrent = null
  }
  preview.replaceChildren()
}

function runCompiled(jsSource: string): CompiledModule {
  const body = jsSource
    .replace(/^import\s+[^\n]+\n/gm, '')
    .replace(/\bexport\s+const\s+/g, 'const ')

  const prelude = `
    const {
      CountOp,
      FilterOp,
      JoinOp,
      ProjectOp,
      SumOp,
      applyZSet,
      changeRecordsToZSets,
      createRuntime,
      createPlatform,
      reconcileList,
      synthDelta,
    } = deps;
    // Sync/persistence is a no-op in the playground
    const createSyncBridge = () => ({ start() {} });
    const BroadcastChannelSync = class {};
    const IndexedDBPersistence = class {};
  `

  const evaluator = new Function(
    'deps',
    `${prelude}\n${body}\nreturn { rt, platform };`,
  ) as (deps: Record<string, unknown>) => CompiledModule

  return evaluator({
    CountOp,
    FilterOp,
    JoinOp,
    ProjectOp,
    SumOp,
    applyZSet,
    changeRecordsToZSets,
    createRuntime,
    createPlatform,
    reconcileList,
    synthDelta,
  })
}

function pickRootView(ast: Declaration[]): string | null {
  const views = ast.filter((d): d is Extract<Declaration, { kind: 'view' }> => d.kind === 'view')
  if (views.length === 0) return null

  const zeroArgView = views.find((v) => v.params.length === 0)
  return (zeroArgView ?? views[0]).name
}

function formatDiagnostics(diagnostics: CheckResult): string {
  const lines: string[] = []

  if (diagnostics.errors.length > 0) {
    lines.push(`Errors (${diagnostics.errors.length}):`)
    for (const err of diagnostics.errors) {
      lines.push(`  L${err.line}:C${err.col}  ${err.message}`)
    }
  }

  if (diagnostics.warnings.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`Warnings (${diagnostics.warnings.length}):`)
    for (const warn of diagnostics.warnings) {
      lines.push(`  L${warn.line}:C${warn.col}  ${warn.message}`)
    }
  }

  if (lines.length === 0) {
    return 'Compile failed with no diagnostics.'
  }

  return lines.join('\n')
}

function setStatus(message: string, isError: boolean): void {
  status.textContent = message
  status.className = isError ? 'status-error' : 'status-ok'
}

function mustElement(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Missing element #${id}`)
  }
  return el
}

function renderTraceLog(): void {
  if (traceBuffer.length === 0) {
    traceLog.textContent = 'No trace entries yet. Interact with the app to see events.'
    return
  }
  traceLog.textContent = traceBuffer.map(formatTraceEntry).join('\n')
  traceLog.scrollTop = traceLog.scrollHeight
}

function formatTraceEntry(entry: RuntimeTraceEntry): string {
  const t = new Date(entry.at).toLocaleTimeString()

  if (entry.kind === 'quiescence') {
    return `[${t}] quiescence`
  }

  if (entry.kind === 'queryNotify') {
    return `[${t}] query ${entry.query} -> ${entry.resultType} size=${entry.size} delta=${entry.deltaSize ?? '-'}`
  }

  const e = entry.event
  const handlerBits = e.handlerTraces
    .map((h) => `h#${h.handlerIndex}[${h.ops.map((op) => op.kind).join(',') || 'no-op'}]`)
    .join(' ')
  return `[${t}] event ${e.name} id=${e.id}${e.parentId ? ` parent=${e.parentId}` : ''} handlers=${e.handlerTraces.length} ${handlerBits} payload=${safeJson(e.payload)}`
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}


window.addEventListener('error', (e) => setStatus(`Unhandled error:\n${e.message}`, true))
window.addEventListener('unhandledrejection', (e) =>
  setStatus(`Unhandled promise rejection:\n${String(e.reason)}`, true)
)
