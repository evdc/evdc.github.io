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
} from '@elysium/runtime'
import { createPlatform, reconcileList } from '@elysium/platform'

import defaultSource from './todomvc-views.ely?raw'

type RuntimeLike = ReturnType<typeof createRuntime>
type PlatformLike = ReturnType<typeof createPlatform>

type CompiledModule = {
  rt: RuntimeLike
  platform: PlatformLike
}

let editor: EditorView
let unmountCurrent: (() => void) | null = null

const app = document.querySelector('#app')
if (!(app instanceof HTMLElement)) {
  throw new Error('Missing #app root')
}

app.innerHTML = `
  <main class="page">
    <header class="header">
      <div>
        <h1>Elysium Playground</h1>
        <p class="subtitle">Edit source, compile in-browser, and render the root view.</p>
      </div>
      <div class="controls">
        <button id="reset-button" type="button">Reset</button>
        <button id="compile-button" class="primary" type="button">Compile</button>
      </div>
    </header>

    <section class="layout">
      <article class="panel">
        <div class="panel-header">Source</div>
        <div id="editor"></div>
        <div id="status" class="status-ok">Ready.</div>
      </article>

      <article class="panel">
        <div class="panel-header">Preview</div>
        <div id="preview-root"></div>
      </article>
    </section>
  </main>
`

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

compileAndRender()

function compileAndRender(): void {
  const source = editor.state.doc.toString()

  teardownPreview(previewHost)

  const result = compile(source)
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

function teardownPreview(preview: HTMLElement): void {
  if (unmountCurrent) {
    unmountCurrent()
    unmountCurrent = null
  }
  preview.replaceChildren()
}

function runCompiled(jsSource: string): CompiledModule {
  const body = jsSource
    .replace(/^import\s+[^\n]+\n/gm, '')
    .replace(/\bexport\s+const\s+rt\s*=\s*/g, 'const rt = ')
    .replace(/\bexport\s+const\s+platform\s*=\s*/g, 'const platform = ')

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
