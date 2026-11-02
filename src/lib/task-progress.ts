import type {
  AssignmentStatus,
  OwnerClient,
  OwnerTask,
  OwnerTaskAssignment,
  OwnerTopic,
  WorkSignal,
} from '~/lib/types'

export type ProgressRow = {
  assignmentId: string
  taskId: string
  clientId: string
  topicId: string | null
  taskTitle: string
  topicTitle: string | null
  clientName: string
  clientEmail: string
  status: AssignmentStatus
  priority: OwnerTask['priority']
  dueAt: string | null
  completedAt: string | null
  overdue: boolean
  daysOpen: number
  ownerSignal: WorkSignal | null
  effectiveSignal: WorkSignal
}

export type PersonProgress = {
  clientId: string
  clientName: string
  clientEmail: string
  assigned: number
  completed: number
  inProgress: number
  pending: number
  skipped: number
  overdue: number
  completionRate: number
  computedSignal: WorkSignal
}

export type ProgressBoard = {
  rows: ProgressRow[]
  people: PersonProgress[]
  totals: {
    assigned: number
    completed: number
    inProgress: number
    pending: number
    skipped: number
    overdue: number
    openTasks: number
    avgCompletionRate: number
  }
}

function daysBetween(fromIso: string, to = Date.now()) {
  const from = new Date(fromIso).getTime()
  if (Number.isNaN(from)) return 0
  return Math.max(0, Math.floor((to - from) / 86_400_000))
}

export function isAssignmentOverdue(task: OwnerTask | undefined, assignment: OwnerTaskAssignment, now = Date.now()) {
  if (!task?.due_at) return false
  if (assignment.status === 'completed' || assignment.status === 'skipped') return false
  const due = new Date(task.due_at).getTime()
  if (Number.isNaN(due)) return false
  return due < now
}

export function computePersonSignal(input: {
  assigned: number
  completed: number
  skipped: number
  overdue: number
}): WorkSignal {
  const { assigned, completed, skipped, overdue } = input
  if (assigned <= 0) return 'on_track'
  const rate = completed / assigned
  const mostlySkipped = skipped / assigned >= 0.5 && completed / assigned < 0.4
  if (rate < 0.4 || mostlySkipped) return 'at_risk'
  if (rate < 0.7 || overdue > 0) return 'needs_attention'
  return 'on_track'
}

export function buildProgressBoard(input: {
  assignments: OwnerTaskAssignment[]
  tasks: OwnerTask[]
  clients: OwnerClient[]
  topics: OwnerTopic[]
  now?: number
}): ProgressBoard {
  const now = input.now ?? Date.now()
  const taskMap = new Map(input.tasks.map((t) => [t.id, t]))
  const clientMap = new Map(input.clients.map((c) => [c.id, c]))
  const topicMap = new Map(input.topics.map((t) => [t.id, t]))

  const byPerson = new Map<
    string,
    {
      clientId: string
      clientName: string
      clientEmail: string
      assigned: number
      completed: number
      inProgress: number
      pending: number
      skipped: number
      overdue: number
    }
  >()

  const rows: ProgressRow[] = input.assignments.map((a) => {
    const task = taskMap.get(a.task_id)
    const client = clientMap.get(a.client_id)
    const topic = task?.topic_id ? topicMap.get(task.topic_id) : undefined
    const overdue = isAssignmentOverdue(task, a, now)
    const clientName = client?.full_name || client?.email || a.client_id.slice(0, 8)
    const clientEmail = client?.email || ''

    let bucket = byPerson.get(a.client_id)
    if (!bucket) {
      bucket = {
        clientId: a.client_id,
        clientName,
        clientEmail,
        assigned: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        skipped: 0,
        overdue: 0,
      }
      byPerson.set(a.client_id, bucket)
    }
    bucket.assigned += 1
    if (a.status === 'completed') bucket.completed += 1
    else if (a.status === 'in_progress') bucket.inProgress += 1
    else if (a.status === 'pending') bucket.pending += 1
    else if (a.status === 'skipped') bucket.skipped += 1
    if (overdue) bucket.overdue += 1

    const ownerSignal = a.owner_signal ?? null
    return {
      assignmentId: a.id,
      taskId: a.task_id,
      clientId: a.client_id,
      topicId: task?.topic_id || null,
      taskTitle: task?.title || 'Task',
      topicTitle: topic?.title || null,
      clientName,
      clientEmail,
      status: a.status,
      priority: task?.priority || 'medium',
      dueAt: task?.due_at || null,
      completedAt: a.completed_at,
      overdue,
      daysOpen: daysBetween(task?.created_at || a.completed_at || new Date(now).toISOString(), now),
      ownerSignal,
      effectiveSignal: ownerSignal || 'on_track', // filled after person rollup
    }
  })

  const people: PersonProgress[] = [...byPerson.values()].map((p) => {
    const computedSignal = computePersonSignal(p)
    return {
      ...p,
      completionRate: p.assigned ? p.completed / p.assigned : 0,
      computedSignal,
    }
  })
  const personSignal = new Map(people.map((p) => [p.clientId, p.computedSignal]))

  for (const row of rows) {
    row.effectiveSignal = row.ownerSignal || personSignal.get(row.clientId) || 'on_track'
  }

  const assigned = rows.length
  const completed = rows.filter((r) => r.status === 'completed').length
  const inProgress = rows.filter((r) => r.status === 'in_progress').length
  const pending = rows.filter((r) => r.status === 'pending').length
  const skipped = rows.filter((r) => r.status === 'skipped').length
  const overdue = rows.filter((r) => r.overdue).length
  const openTaskIds = new Set(
    rows.filter((r) => r.status === 'pending' || r.status === 'in_progress').map((r) => r.taskId),
  )
  const avgCompletionRate =
    people.length === 0
      ? 0
      : people.reduce((sum, p) => sum + p.completionRate, 0) / people.length

  return {
    rows,
    people,
    totals: {
      assigned,
      completed,
      inProgress,
      pending,
      skipped,
      overdue,
      openTasks: openTaskIds.size,
      avgCompletionRate,
    },
  }
}

export function signalLabel(signal: WorkSignal) {
  if (signal === 'on_track') return 'On track'
  if (signal === 'needs_attention') return 'Needs attention'
  return 'At risk'
}
