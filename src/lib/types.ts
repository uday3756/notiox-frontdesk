export type OwnerRole =
  | 'coach'
  | 'adhd_trainer'
  | 'mental_health_doctor'
  | 'ugc_creator'
  | 'other'

export type ClientStatus = 'active' | 'inactive' | 'invited' | 'churned'

export type TaskPriority = 'low' | 'medium' | 'high'
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled'
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'

export type CodeType = 'promo' | 'referral' | 'invite'

export type CampaignStatus =
  | 'draft'
  | 'tested'
  | 'sending'
  | 'sent'
  | 'failed'
  | 'cancelled'

export interface Owner {
  id: string
  email: string
  full_name: string | null
  role: OwnerRole
  brand_name: string | null
  brand_logo_url: string | null
  custom_domain: string | null
  custom_domain_verified: boolean
  settings: Record<string, unknown>
}

export interface OwnerClient {
  id: string
  owner_id: string
  email: string
  full_name: string | null
  status: ClientStatus
  code_id: string | null
  notes: string | null
  tags: string[]
  last_active_at: string | null
  created_at: string
}

export interface OwnerCode {
  id: string
  owner_id: string
  code: string
  label: string | null
  code_type: CodeType
  max_uses: number | null
  use_count: number
  active: boolean
  expires_at: string | null
  created_at: string
}

export interface OwnerTopic {
  id: string
  owner_id: string
  title: string
  description: string | null
  created_at: string
}

export interface OwnerTask {
  id: string
  owner_id: string
  topic_id: string | null
  title: string
  description: string | null
  due_at: string | null
  priority: TaskPriority
  status: TaskStatus
  created_at: string
}

export interface OwnerAppConnection {
  virtual_domain: string
  school_domain: string | null
  api_key: string
  updated_at: string
}

export interface OwnerTaskAssignment {
  id: string
  owner_id: string
  task_id: string
  client_id: string
  status: AssignmentStatus
  completed_at: string | null
}

export interface EmailCampaign {
  id: string
  owner_id: string
  subject: string
  body_html: string
  body_text: string | null
  extra_content: string | null
  status: CampaignStatus
  recipient_mode: 'all' | 'selected'
  recipient_client_ids: string[]
  test_sent_at: string | null
  test_to_email: string | null
  sent_at: string | null
}

export interface DashboardInsights {
  totalClients: number
  activeClients: number
  invitedClients: number
  inactiveClients: number
  taskCompletionRate: number
  openTasks: number
  completedAssignments: number
  totalAssignments: number
  activeCodes: number
  revenuePlaceholder: {
    mtdCents: number
    currency: string
    note: string
  }
}

export const ROLE_LABELS: Record<OwnerRole, string> = {
  coach: 'Coach',
  adhd_trainer: 'ADHD trainer',
  mental_health_doctor: 'Mental health doctor',
  ugc_creator: 'UGC content creator',
  other: 'Other',
}
