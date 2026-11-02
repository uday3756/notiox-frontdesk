import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AssignmentStatus,
  GoogleCalendarConnection,
  OwnerAppConnection,
  OwnerAudience,
  OwnerOffering,
  OwnerOfferingSection,
  OwnerOfferingSession,
  OwnerSmtpConfig,
  OwnerTask,
  OwnerTaskAssignment,
  OwnerTopic,
  WorkSignal,
} from '~/lib/types'
import { normalizeAudience } from '~/lib/audience'
import { getSupabaseAdmin } from '~/lib/supabase.server'

const MARKER = '__nxfd__'

export type WorkspaceBlob = {
  topics: OwnerTopic[]
  tasks: OwnerTask[]
  assignments: OwnerTaskAssignment[]
  app?: OwnerAppConnection | null
  smtp?: OwnerSmtpConfig | null
  audience?: OwnerAudience | null
  offerings?: OwnerOffering[]
  offeringSections?: OwnerOfferingSection[]
  offeringSessions?: OwnerOfferingSession[]
  googleCalendar?: GoogleCalendarConnection | null
  bio?: string
}

type Blob = WorkspaceBlob

function emptyBlob(): Blob {
  return {
    topics: [],
    tasks: [],
    assignments: [],
    app: null,
    smtp: null,
    audience: null,
    offerings: [],
    offeringSections: [],
    offeringSessions: [],
    googleCalendar: null,
    bio: '',
  }
}

export function splitDoctorNotes(notes: string | null): { bio: string; blob: Blob } {
  if (!notes) return { bio: '', blob: emptyBlob() }
  try {
    const parsed = JSON.parse(notes) as { [MARKER]?: Blob; bio?: string }
    if (parsed && typeof parsed === 'object' && parsed[MARKER]) {
      const blob = { ...emptyBlob(), ...parsed[MARKER] }
      return { bio: typeof parsed.bio === 'string' ? parsed.bio : blob.bio || '', blob }
    }
  } catch {
    /* plain text notes */
  }
  return { bio: notes, blob: emptyBlob() }
}

export function joinDoctorNotes(bio: string, blob: Blob): string {
  return JSON.stringify({ bio, [MARKER]: { ...blob, bio: undefined } })
}

function missingTable(error: { message?: string; code?: string } | null) {
  const m = (error?.message || '').toLowerCase()
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    m.includes('does not exist') ||
    m.includes('schema cache')
  )
}

export async function loadWorkspace(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
): Promise<{ blob: Blob; source: 'table' | 'notes' }> {
  const { data: topics, error } = await db
    .from('fd_topics')
    .select('id, doctor_id, title, description, created_at')
    .eq('doctor_id', doctorId)
    .order('created_at', { ascending: false })

  if (error && missingTable(error)) {
    const { blob } = splitDoctorNotes(notes)
    return { blob, source: 'notes' }
  }
  if (error) throw new Error(error.message)

  const [{ data: tasks }, { data: assignments }, { data: appRows }] = await Promise.all([
    db.from('fd_tasks').select('*').eq('doctor_id', doctorId).order('created_at', { ascending: false }),
    db.from('fd_task_assignments').select('*').eq('doctor_id', doctorId),
    db.from('fd_app_connections').select('*').eq('doctor_id', doctorId).maybeSingle(),
  ])

  const app = appRows
    ? {
        virtual_domain: appRows.virtual_domain,
        school_domain: appRows.school_domain,
        api_key: appRows.api_key,
        updated_at: appRows.updated_at,
      }
    : null

  const notesBlob = splitDoctorNotes(notes).blob
  const notesSignal = new Map(
    (notesBlob.assignments || []).map((a) => [a.id, a.owner_signal ?? null] as const),
  )

  return {
    source: 'table',
    blob: {
      topics: (topics || []).map((t) => ({
        id: t.id,
        owner_id: t.doctor_id,
        title: t.title,
        description: t.description,
        created_at: t.created_at,
      })),
      tasks: (tasks || []).map((t) => ({
        id: t.id,
        owner_id: t.doctor_id,
        topic_id: t.topic_id,
        title: t.title,
        description: t.description,
        due_at: t.due_at,
        priority: t.priority,
        status: t.status,
        created_at: t.created_at,
      })),
      assignments: (assignments || []).map((a) => {
        const fromCol = (a as { owner_signal?: WorkSignal | null }).owner_signal
        return {
          id: a.id,
          owner_id: a.doctor_id,
          task_id: a.task_id,
          client_id: a.patient_id,
          status: a.status,
          completed_at: a.completed_at,
          owner_signal: fromCol ?? notesSignal.get(a.id) ?? null,
        }
      }),
      app,
      smtp: notesBlob.smtp ?? null,
      audience: notesBlob.audience ?? null,
      offerings: notesBlob.offerings || [],
      offeringSections: notesBlob.offeringSections || [],
      offeringSessions: notesBlob.offeringSessions || [],
      googleCalendar: notesBlob.googleCalendar ?? null,
    },
  }
}

/**
 * Persist the __nxfd__ workspace blob on doctors.notes.
 * Shared NotioX doctors RLS often allows SELECT but not UPDATE for the owner JWT,
 * so we write with the service role after the caller has already authenticated the owner.
 */
export async function saveNotesBlob(
  _db: SupabaseClient,
  doctorId: string,
  bio: string,
  blob: Blob,
) {
  const admin = getSupabaseAdmin()
  if (!admin) {
    throw new Error(
      'Saving mailbox/settings needs SUPABASE_SERVICE_ROLE_KEY on the server (owner JWT cannot update doctors).',
    )
  }
  const { data, error } = await admin
    .from('doctors')
    .update({ notes: joinDoctorNotes(bio, blob) })
    .eq('id', doctorId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('Could not update doctor profile (no matching row).')
}

export async function insertTopic(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  title: string,
  description?: string,
): Promise<{ topic: OwnerTopic; source: 'table' | 'notes' }> {
  const topic: OwnerTopic = {
    id: crypto.randomUUID(),
    owner_id: doctorId,
    title,
    description: description || null,
    created_at: new Date().toISOString(),
  }
  const { error } = await db.from('fd_topics').insert({
    id: topic.id,
    doctor_id: doctorId,
    title,
    description: description || null,
    created_at: topic.created_at,
  })
  if (error && missingTable(error)) {
    const { bio, blob } = splitDoctorNotes(notes)
    blob.topics.unshift(topic)
    await saveNotesBlob(db, doctorId, bio, blob)
    return { topic, source: 'notes' }
  }
  if (error) throw new Error(error.message)
  return { topic, source: 'table' }
}

export async function insertTaskWithAssignments(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  input: {
    title: string
    description?: string
    priority: OwnerTask['priority']
    topicId?: string
    dueAt?: string
    clientIds: string[]
  },
): Promise<{ task: OwnerTask; assignments: OwnerTaskAssignment[]; source: 'table' | 'notes' }> {
  const task: OwnerTask = {
    id: crypto.randomUUID(),
    owner_id: doctorId,
    topic_id: input.topicId || null,
    title: input.title,
    description: input.description ?? null,
    due_at: input.dueAt ?? null,
    priority: input.priority,
    status: 'open',
    created_at: new Date().toISOString(),
  }
  const assignments: OwnerTaskAssignment[] = input.clientIds.map((clientId) => ({
    id: crypto.randomUUID(),
    owner_id: doctorId,
    task_id: task.id,
    client_id: clientId,
    status: 'pending',
    completed_at: null,
    owner_signal: null,
  }))

  const { error } = await db.from('fd_tasks').insert({
    id: task.id,
    doctor_id: doctorId,
    topic_id: task.topic_id,
    title: task.title,
    description: task.description,
    due_at: task.due_at,
    priority: task.priority,
    status: task.status,
    created_at: task.created_at,
  })

  if (error && missingTable(error)) {
    const { bio, blob } = splitDoctorNotes(notes)
    blob.tasks.unshift(task)
    blob.assignments.push(...assignments)
    await saveNotesBlob(db, doctorId, bio, blob)
    return { task, assignments, source: 'notes' }
  }
  if (error) throw new Error(error.message)

  if (assignments.length) {
    const { error: aErr } = await db.from('fd_task_assignments').insert(
      assignments.map((a) => ({
        id: a.id,
        doctor_id: doctorId,
        task_id: a.task_id,
        patient_id: a.client_id,
        status: a.status,
      })),
    )
    if (aErr) throw new Error(aErr.message)
  }
  return { task, assignments, source: 'table' }
}

export async function upsertAppConnection(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  conn: OwnerAppConnection,
): Promise<{ app: OwnerAppConnection; source: 'table' | 'notes' }> {
  const { error } = await db.from('fd_app_connections').upsert({
    doctor_id: doctorId,
    virtual_domain: conn.virtual_domain,
    school_domain: conn.school_domain,
    api_key: conn.api_key,
    updated_at: conn.updated_at,
  })
  if (error && missingTable(error)) {
    const { bio, blob } = splitDoctorNotes(notes)
    blob.app = conn
    await saveNotesBlob(db, doctorId, bio, blob)
    return { app: conn, source: 'notes' }
  }
  if (error) throw new Error(error.message)
  return { app: conn, source: 'table' }
}

export async function saveSmtpConfig(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  smtp: OwnerSmtpConfig | null,
): Promise<OwnerSmtpConfig | null> {
  const { bio, blob } = splitDoctorNotes(notes)
  blob.smtp = smtp
  await saveNotesBlob(db, doctorId, bio, blob)
  return smtp
}

export async function saveWorkspacePatch(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  patch: Partial<WorkspaceBlob>,
): Promise<WorkspaceBlob> {
  const { bio, blob } = splitDoctorNotes(notes)
  Object.assign(blob, patch)
  await saveNotesBlob(db, doctorId, bio, blob)
  return blob
}

export async function saveAudienceConfig(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  audience: OwnerAudience,
): Promise<OwnerAudience> {
  const { bio, blob } = splitDoctorNotes(notes)
  blob.audience = normalizeAudience(audience)
  await saveNotesBlob(db, doctorId, bio, blob)
  return blob.audience
}

export async function updateAssignmentStatus(
  db: SupabaseClient,
  doctorId: string,
  notes: string | null,
  input: {
    assignmentId: string
    status?: AssignmentStatus
    ownerSignal?: WorkSignal | null
    clearOwnerSignal?: boolean
  },
): Promise<{ assignment: OwnerTaskAssignment; source: 'table' | 'notes' }> {
  const patch: Record<string, unknown> = {}
  if (input.status) {
    patch.status = input.status
    patch.completed_at = input.status === 'completed' ? new Date().toISOString() : null
  }
  if (input.clearOwnerSignal) patch.owner_signal = null
  else if (input.ownerSignal !== undefined) patch.owner_signal = input.ownerSignal

  const { data, error } = await db
    .from('fd_task_assignments')
    .update(patch)
    .eq('id', input.assignmentId)
    .eq('doctor_id', doctorId)
    .select('id, doctor_id, task_id, patient_id, status, completed_at, owner_signal')
    .maybeSingle()

  if (error && missingTable(error)) {
    const { bio, blob } = splitDoctorNotes(notes)
    const idx = blob.assignments.findIndex((a) => a.id === input.assignmentId)
    if (idx < 0) throw new Error('Assignment not found')
    const current = blob.assignments[idx]!
    const next: OwnerTaskAssignment = {
      ...current,
      status: input.status || current.status,
      completed_at:
        input.status === 'completed'
          ? new Date().toISOString()
          : input.status
            ? null
            : current.completed_at,
      owner_signal: input.clearOwnerSignal
        ? null
        : input.ownerSignal !== undefined
          ? input.ownerSignal
          : current.owner_signal ?? null,
    }
    blob.assignments[idx] = next
    await saveNotesBlob(db, doctorId, bio, blob)
    return { assignment: next, source: 'notes' }
  }

  if (error) {
    // Column may not exist yet — retry without owner_signal
    if (String(error.message || '').toLowerCase().includes('owner_signal')) {
      const slim = { ...patch }
      delete slim.owner_signal
      const { data: retry, error: retryErr } = await db
        .from('fd_task_assignments')
        .update(slim)
        .eq('id', input.assignmentId)
        .eq('doctor_id', doctorId)
        .select('id, doctor_id, task_id, patient_id, status, completed_at')
        .maybeSingle()
      if (retryErr) throw new Error(retryErr.message)
      if (!retry) throw new Error('Assignment not found')
      const { bio, blob } = splitDoctorNotes(notes)
      const idx = blob.assignments.findIndex((a) => a.id === input.assignmentId)
      let ownerSignal: WorkSignal | null = null
      if (input.clearOwnerSignal) ownerSignal = null
      else if (input.ownerSignal !== undefined) ownerSignal = input.ownerSignal
      else if (idx >= 0) ownerSignal = blob.assignments[idx]?.owner_signal ?? null
      if (idx >= 0 || input.ownerSignal !== undefined || input.clearOwnerSignal) {
        if (idx >= 0) {
          blob.assignments[idx] = {
            ...blob.assignments[idx]!,
            status: (retry.status as AssignmentStatus) || blob.assignments[idx]!.status,
            completed_at: retry.completed_at,
            owner_signal: ownerSignal,
          }
        }
        await saveNotesBlob(db, doctorId, bio, blob)
      }
      return {
        assignment: {
          id: retry.id,
          owner_id: retry.doctor_id,
          task_id: retry.task_id,
          client_id: retry.patient_id,
          status: retry.status as AssignmentStatus,
          completed_at: retry.completed_at,
          owner_signal: ownerSignal,
        },
        source: 'table',
      }
    }
    throw new Error(error.message)
  }
  if (!data) throw new Error('Assignment not found')

  return {
    assignment: {
      id: data.id,
      owner_id: data.doctor_id,
      task_id: data.task_id,
      client_id: data.patient_id,
      status: data.status as AssignmentStatus,
      completed_at: data.completed_at,
      owner_signal: (data as { owner_signal?: WorkSignal | null }).owner_signal ?? null,
    },
    source: 'table',
  }
}

export function newApiKey() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `fd_${hex}`
}

export const DEFAULT_VIRTUAL_DOMAIN = 'notiox-frontdesk.vercel.app'
