import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import css from './workbench.module.css'

const WORKBENCH_ID = '@seksun/dsh-client-ui-cnc-workbench'
const WORKBENCH_KIND = 'cnc-workbench'
const JOB_ID = /\b[a-f0-9]{32}\b/iu

type WorkbenchStage = 'model' | 'features' | 'process' | 'toolpath' | 'simulation'

interface WorkbenchParams {
  readonly jobId?: string
  readonly stage?: WorkbenchStage
}
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap {
    'cnc-workbench': WorkbenchParams
  }
}

const STAGES: readonly { readonly id: WorkbenchStage; readonly label: string; readonly hint: string }[] = [
  { id: 'model', label: '模型', hint: '零件与毛坯' },
  { id: 'features', label: '特征', hint: '制造语义' },
  { id: 'process', label: '工序', hint: '装夹与顺序' },
  { id: 'toolpath', label: '刀路', hint: '运动轨迹' },
  { id: 'simulation', label: '仿真', hint: '余料与门禁' },
]

const TOOL_PRESENTATION: Readonly<Record<string, {
  readonly title: string
  readonly running: string
  readonly complete: string
  readonly stage: WorkbenchStage
}>> = {
  create_job_from_step: { title: '导入三维模型', running: '正在创建 CNC 分析任务', complete: '模型已进入几何分析', stage: 'model' },
  inspect_job_progress: { title: '解析模型几何', running: '正在读取解析进度', complete: '几何解析状态已更新', stage: 'model' },
  open_job_context: { title: '接入任务上下文', running: '正在绑定当前零件', complete: '任务上下文已就绪', stage: 'model' },
  inspect_geometry: { title: '理解制造几何', running: '正在分析轮廓、孔槽与可达方向', complete: '制造几何证据已更新', stage: 'features' },
  observe_model: { title: '观察三维模型', running: '正在生成多视角模型观察', complete: '模型视觉观察已完成', stage: 'features' },
  inspect_machine: { title: '核对机床与刀具', running: '正在读取设备能力和刀具库存', complete: '制造资源约束已更新', stage: 'process' },
  initialize_process_draft: { title: '建立工艺草案', running: '正在创建装夹与毛坯基线', complete: '可验证工艺草案已建立', stage: 'process' },
  inspect_operation_catalog: { title: '检索候选工序', running: '正在匹配可执行的工序能力', complete: '候选工序能力已返回', stage: 'process' },
  add_process_operation: { title: '设计下一道工序', running: '正在把候选工序加入草案', complete: '候选工序已加入规划', stage: 'process' },
  revise_process_operation: { title: '修正工序方案', running: '正在调整刀具、参数或几何绑定', complete: '工序方案已更新', stage: 'process' },
  trial_l32_operation: { title: '试算单道工序', running: '正在生成刀路并连续材料仿真', complete: '单道工序试算已完成', stage: 'simulation' },
  evaluate_l32_operation_candidates: { title: '比较修复候选', running: '正在隔离试算多个修复方案', complete: '候选方案对比已完成', stage: 'simulation' },
  auto_repair_l32_operation: { title: '自动修复工序', running: '正在依据失败证据生成并试算修复', complete: '自动修复结果已返回', stage: 'simulation' },
  apply_l32_operation_candidate: { title: '应用修复方案', running: '正在应用已验证候选', complete: '修复候选已应用', stage: 'process' },
  accept_l32_operation_trial: { title: '接受单道验证', running: '正在推进累计余料状态', complete: '该道工序已通过验证', stage: 'simulation' },
  inspect_l32_operation_trial_state: { title: '检查滚动规划状态', running: '正在恢复已验证工序前缀', complete: '滚动规划状态已更新', stage: 'simulation' },
  inspect_validation: { title: '审核仿真证据', running: '正在读取碰撞、过切和余料证据', complete: '验证证据已更新', stage: 'simulation' },
  finalize_harness_process_plan: { title: '整件工艺验证', running: '正在检查制造覆盖率与连续材料结果', complete: '整件工艺验证已完成', stage: 'simulation' },
}

function shortToolName(name: string): string {
  const marker = '__cnc__'
  const at = name.lastIndexOf(marker)
  return at < 0 ? name : name.slice(at + marker.length)
}

function resultText(props: ToolCallViewProps): string {
  if (props.phase !== 'result') return ''
  return props.block.content.map(block => block.type === 'text' ? block.text : '').filter(Boolean).join('\n')
}

function argumentsText(props: ToolCallViewProps): string {
  if (props.phase === 'preparing') return ''
  if (props.phase === 'start') return props.block.argsRaw
  return props.block.call?.argsRaw ?? ''
}

function jobIdOf(props: ToolCallViewProps): string | undefined {
  const argMatch = argumentsText(props).match(JOB_ID)?.[0]
  return argMatch ?? resultText(props).match(JOB_ID)?.[0]
}

function cncOrigin(): string {
  const configured = globalThis.localStorage?.getItem('cnc.baseUrl')?.trim()
  return configured !== undefined && configured !== '' ? configured.replace(/\/$/u, '') : 'http://127.0.0.1:3001'
}

function jobUrl(jobId: string, stage: WorkbenchStage): string {
  const query = new URLSearchParams({ embed: 'harness', focus: stage })
  return `${cncOrigin()}/jobs/${encodeURIComponent(jobId)}?${query}`
}

type WorkbenchBodyProps = PropsRuntime<'sidebar.right.pane.tab'>

function WorkbenchBody({ useTabInfo }: WorkbenchBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const params = (tab.navigation.params ?? {}) as WorkbenchParams
  const [selected, setSelected] = useState<WorkbenchStage>(params.stage ?? 'model')
  const activeJobId = useRef(params.jobId)
  useEffect(() => {
    if (activeJobId.current === params.jobId) return
    activeJobId.current = params.jobId
    setSelected(params.stage ?? 'model')
  }, [params.jobId, params.stage])
  const url = params.jobId === undefined ? undefined : jobUrl(params.jobId, selected)

  return (
    <section className={css.workbench} data-cnc-workbench="">
      <header className={css.workbenchHeader}>
        <div>
          <p className={css.eyebrow}>CNC ENGINEERING WORKSPACE</p>
          <h2>制造现场</h2>
        </div>
        {params.jobId !== undefined && <code className={css.jobId}>{params.jobId.slice(0, 8)}</code>}
      </header>
      <nav className={css.stageTabs} aria-label="CNC 工程视图">
        {STAGES.map(stage => (
          <button
            type="button"
            key={stage.id}
            className={stage.id === selected ? css.stageActive : css.stage}
            onClick={() => { setSelected(stage.id) }}
          >
            <span>{stage.label}</span><small>{stage.hint}</small>
          </button>
        ))}
      </nav>
      <div className={css.viewer}>
        {url === undefined
          ? <div className={css.empty}>
            <span className={css.emptyMark}>N</span>
            <h3>等待 CNC 任务</h3>
            <p>上传 STEP 后，模型理解、工序、刀路和仿真会随着智能体调用实时进入这里。</p>
          </div>
          : <iframe
            title="CNC 工程现场"
            src={url}
            sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
          />}
      </div>
    </section>
  )
}

function CncToolRow({ props, openWorkspace }: {
  readonly props: ToolCallViewProps
  readonly openWorkspace: (jobId: string, stage: WorkbenchStage) => void
}): ReactNode {
  const operation = shortToolName(props.toolName)
  const presentation = TOOL_PRESENTATION[operation] ?? {
    title: '调用 CNC 工程工具', running: '正在执行制造分析', complete: '制造分析已更新', stage: 'process' as const,
  }
  const jobId = jobIdOf(props)
  const failed = props.phase === 'result' && props.block.isError
  const settled = props.phase === 'result'
  const previousPhase = useRef(props.phase)
  const openedResult = useRef(false)
  const openedRunning = useRef(false)

  useEffect(() => {
    if (props.phase !== 'result' && jobId !== undefined && !openedRunning.current) {
      openedRunning.current = true
      openWorkspace(jobId, presentation.stage)
    }
    if (previousPhase.current !== 'result' && props.phase === 'result' && !failed && jobId !== undefined && !openedResult.current) {
      openedResult.current = true
      openWorkspace(jobId, presentation.stage)
    }
    previousPhase.current = props.phase
  }, [failed, jobId, openWorkspace, presentation.stage, props.phase])

  const status = failed ? '执行失败' : settled ? presentation.complete : presentation.running
  return (
    <article className={css.toolRow} data-cnc-tool={operation} data-state={failed ? 'error' : settled ? 'complete' : 'running'}>
      <span className={css.toolIcon} aria-hidden>{settled && !failed ? '✓' : failed ? '!' : '↻'}</span>
      <div className={css.toolCopy}>
        <p className={css.toolMeta}>CNC 工具 · {operation}</p>
        <strong>{presentation.title}</strong>
        <span>{status}</span>
      </div>
      {jobId !== undefined && <button type="button" onClick={() => { openWorkspace(jobId, presentation.stage) }}>查看现场</button>}
    </article>
  )
}

/** Required services: Slots plus the right-Sidebar registry and navigation face. */
export const inject = ['slots', 'sidebarRight', 'sidebarRightTabs']

/** Register the CNC engineering page and compact business views for CNC MCP tools. */
export function apply(ctx: Context): void {
  const definition: SidebarRightTabDefinition = {
    id: WORKBENCH_ID,
    kind: WORKBENCH_KIND,
    priority: 'extension',
    title: () => 'CNC 工程',
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'ui-cnc-workbench: tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
    name: 'sidebar.right.pane.tab', key: WORKBENCH_ID,
  }, WorkbenchBody)), 'ui-cnc-workbench: tab body')

  const openWorkspace = (jobId: string, stage: WorkbenchStage): void => {
    ctx.sidebarRight.openTab(WORKBENCH_KIND, { params: { jobId, stage } })
  }
  const View = (props: ToolCallViewProps): ReactNode => <CncToolRow props={props} openWorkspace={openWorkspace} />
  const names = Object.keys(TOOL_PRESENTATION)
  ctx.effect(() => ctx.slots.inject('tool.call.toolview', function* () {
    for (const name of names) {
      yield ctx.slots.register({ name: 'tool.call.toolview', key: `mcp__cnc__${name}` }, View)
      yield ctx.slots.register({ name: 'tool.call.toolview', key: name }, View)
    }
  }), 'ui-cnc-workbench: CNC tool views')
}
