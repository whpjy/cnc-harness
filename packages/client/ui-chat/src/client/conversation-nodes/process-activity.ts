/** Tool-category and live-detail interpretation owned by Chat grouping. */
import type { ProcessActivity, ProcessActivitySummary } from '../contract/process-groups.ts'
import type { ChatNode } from '../contract/chat-nodes.ts'
import { isRunningTool } from '../contract/chat-nodes.ts'
import type { ToolCallBlock } from '../contract/snapshot.ts'
import { toSimplifiedChinese } from '../simplified-chinese.ts'

function activity(name: string): ProcessActivity {
  if (name === 'read') return 'read'
  if (name === 'read_image') return 'readImage'
  if (name === 'grep' || name === 'glob' || name.endsWith('_inspect')) return 'search'
  if (name === 'write') return 'write'
  if (name === 'edit' || name === 'apply_patch') return 'edit'
  if (['bash', 'pwsh', 'exec_command', 'write_stdin'].includes(name) || name.startsWith('terminal_')) return 'commands'
  if (name === 'run_code') return 'code'
  if (name === 'web_search') return 'webSearch'
  if (name === 'web_fetch') return 'webFetch'
  if (name === 'subagent' || name.startsWith('subagent_')) return 'subagents'
  if (['todo_write', 'create_goal', 'update_goal', 'get_goal'].includes(name)) return 'plan'
  if (name === 'ask_user_question' || name === 'request_user_input') return 'questions'
  return 'tools'
}

const LIVE_TOOL_DETAIL_MAX_CHARS = 160
const LIVE_TOOL_DETAIL_SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const TOOL_DISPLAY_NAMES_ZH: Readonly<Record<string, string>> = {
  create_job_from_step: '导入三维模型',
  inspect_job_progress: '检查模型解析进度',
  initialize_process_draft: '建立工艺草案',
  inspect_operation_catalog: '查询候选工序',
  inspect_tool_catalog: '查询刀具目录',
  add_process_operation: '设计下一道工序',
  trial_l32_operation: '试算单道工序',
  accept_l32_operation_trial: '接受工序验证结果',
  inspect_l32_operation_trial_state: '检查滚动规划状态',
  evaluate_l32_operation_candidates: '比较工序修复方案',
  auto_repair_l32_operation: '自动修复工序',
  apply_l32_operation_candidate: '应用工序修复方案',
  finalize_harness_process_plan: '执行整件工艺验证',
  revise_process_operation: '修正工序方案',
  remove_process_operation: '移除工序',
  reorder_process_operations: '调整工序顺序',
  open_job_context: '打开 CNC 任务',
  inspect_job: '查看 CNC 任务',
  inspect_geometry: '分析制造几何',
  inspect_l32_profile_review_request: '检查回转轮廓审核请求',
  provisionally_accept_l32_profile: '临时接受回转轮廓',
  inspect_machine: '检查机床与刀具能力',
  observe_model: '观察三维模型',
  inspect_validation: '检查仿真验证结果',
  validate_l32_plan: '验证 L32 工艺方案',
  inspect_l32_operation_loop: '检查工序规划闭环',
  advance_l32_operation: '推进下一道工序',
  inspect_l32_repair_options: '查看工序修复选项',
  select_l32_repair_candidate: '选择工序修复方案',
}
const LIVE_TOOL_DETAIL_KEYS = [
  'title', 'description', 'objective', 'task', 'task_name', 'name', 'question', 'questions', 'prompt', 'message',
  'command', 'cmd', 'queries', 'query', 'pattern', 'url', 'uri', 'file_path', 'path', 'target', 'action', 'status',
] as const

function toolDisplayName(name: string): string {
  const operation = name.split('__').at(-1) ?? name
  const translated = TOOL_DISPLAY_NAMES_ZH[operation]
  if (translated !== undefined) return translated
  if (name.includes('__cnc__') || name.startsWith('mcp_cnc__')) return 'CNC 制造工具'
  if (name.startsWith('mcp__') || name.startsWith('mcp_')) return '外部工具'
  return name
}

function normalizeLiveToolDetail(value: unknown): string {
  const text = typeof value === 'string'
    ? value
    : Array.isArray(value) && value.every(item => typeof item === 'string')
      ? value.join(', ')
      : ''
  const normalized = toSimplifiedChinese(text.replace(/\s+/g, ' ').trim())
  const chars = Array.from(LIVE_TOOL_DETAIL_SEGMENTER.segment(normalized), part => part.segment)
  return chars.length <= LIVE_TOOL_DETAIL_MAX_CHARS
    ? normalized
    : `${chars.slice(0, LIVE_TOOL_DETAIL_MAX_CHARS - 1).join('').trimEnd()}…`
}

function questionDetail(value: unknown): string {
  if (!Array.isArray(value)) return ''
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue
    const detail = normalizeLiveToolDetail(Reflect.get(item, 'question'))
    if (detail !== '') return detail
  }
  return ''
}

function liveReasoningDetail(nodes: readonly ChatNode[]): string {
  for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex--) {
    const node = nodes[nodeIndex]
    if (node?.kind !== 'assistant-step' || node.data.status !== 'running') continue
    for (let blockIndex = node.data.blocks.length - 1; blockIndex >= 0; blockIndex--) {
      const block = node.data.blocks[blockIndex]
      if (block?.kind !== 'reasoning') continue
      const paragraphs = block.text.split(/\r?\n[\t ]*\r?\n/)
      for (let paragraphIndex = paragraphs.length - 1; paragraphIndex >= 0; paragraphIndex--) {
        const detail = normalizeLiveToolDetail(paragraphs[paragraphIndex]?.replaceAll('**', ''))
        if (detail !== '') return detail
      }
    }
  }
  return ''
}

function liveToolDetail(name: string, argsRaw: string): string {
  let args: unknown
  try {
    args = JSON.parse(argsRaw)
  } catch (_error: unknown) {
    // Partial or free-form arguments have no safe one-line task detail.
    return toolDisplayName(name)
  }
  if (args === null || typeof args !== 'object') return toolDisplayName(name)
  for (const key of LIVE_TOOL_DETAIL_KEYS) {
    if (key in args) {
      const value: unknown = Reflect.get(args, key)
      const detail = key === 'questions' ? questionDetail(value) : normalizeLiveToolDetail(value)
      if (detail !== '') return detail
    }
  }
  return toolDisplayName(name)
}

/**
 * Rank categories by distinct call count, breaking ties by first appearance.
 * @param nodes - process members, including recursive tools.
 * @returns all ranked categories and the latest running tool category and bounded task detail.
 */
export function processActivity(nodes: readonly ChatNode[]): ProcessActivitySummary {
  const counts = new Map<ProcessActivity, number>()
  const seen = new Set<string>()
  let running: ProcessActivity | undefined
  let runningDetail = ''
  let runningTime = -Infinity
  let preparing: boolean | undefined
  const visit = (tool: ToolCallBlock): void => {
    if (seen.has(tool.callId)) return
    seen.add(tool.callId)
    const call = isRunningTool(tool) ? tool : tool.call
    if (call !== null) {
      const kind = activity(call.name)
      if (isRunningTool(tool) && tool.time >= runningTime) {
        running = kind
        preparing = tool.phase === 'preparing'
        runningDetail = tool.phase === 'preparing'
          ? kind === 'tools' ? toolDisplayName(tool.name) : ''
          : liveToolDetail(tool.name, tool.argsRaw)
        runningTime = tool.time
      }
      counts.set(kind, (counts.get(kind) ?? 0) + 1)
    }
    for (const child of tool.subCalls) visit(child)
  }
  for (const node of nodes) {
    if (node.kind === 'tool-call') visit(node.data.root)
  }
  if (running === undefined) runningDetail = liveReasoningDetail(nodes)
  return {
    counts: [...counts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    running,
    runningDetail,
    ...preparing ? { preparing: true } : {},
  }
}
