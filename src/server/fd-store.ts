import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  OwnerAppConnection,
  OwnerSmtpConfig,
  OwnerTask,
  OwnerTaskAssignment,
  OwnerTopic,
} from '~/lib/types'
import { getSupabaseAdmin } from '~/lib/supabase.server'

const MARKER = '__nxfd__'

type Blob = {
  topics: OwnerTopic[]
  tasks: OwnerTask[]
  assignments: OwnerTaskAssignment[]
  app?: OwnerAppConnection | null
  smtp?: OwnerSmtpConfig | null
  bio?: string
}

function emptyBlob(): Blob {
  return { topics: [], tasks: [], assignments: [], app: null, smtp: null, bio: '' }
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
      assignments: (assignments || []).map((a) => ({
        id: a.id,
        owner_id: a.doctor_id,
        task_id: a.task_id,
        client_id: a.patient_id,
        status: a.status,
        completed_at: a.completed_at,
      })),
      app,
      smtp: splitDoctorNotes(notes).blob.smtp ?? null,
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

export function newApiKey() {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `fd_${hex}`
}

export const DEFAULT_VIRTUAL_DOMAIN = 'notiox-frontdesk.vercel.app'
