import type {
  DashboardInsights,
  EmailCampaign,
  Owner,
  OwnerClient,
  OwnerCode,
  OwnerTask,
  OwnerTaskAssignment,
} from './types'

/** In-memory demo store when Supabase keys are missing — local UI smoke only */

export const demoOwner: Owner = {
  id: 'demo-owner',
  email: 'owner@example.com',
  full_name: 'Alex Rivera',
  role: 'coach',
  brand_name: 'NotioX Front Desk',
  brand_logo_url: null,
  custom_domain: null,
  custom_domain_verified: false,
  settings: {},
}

export const demoClients: OwnerClient[] = [
  {
    id: 'c1',
    owner_id: 'demo-owner',
    email: 'jamie@example.com',
    full_name: 'Jamie Chen',
    status: 'active',
    code_id: 'code1',
    notes: 'Prefers morning check-ins',
    tags: ['focus'],
    last_active_at: new Date().toISOString(),
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
  {
    id: 'c2',
    owner_id: 'demo-owner',
    email: 'sam@example.com',
    full_name: 'Sam Okonkwo',
    status: 'active',
    code_id: 'code1',
    notes: null,
    tags: ['habits'],
    last_active_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
  },
  {
    id: 'c3',
    owner_id: 'demo-owner',
    email: 'riley@example.com',
    full_name: 'Riley Park',
    status: 'inactive',
    code_id: null,
    notes: 'Paused for travel',
    tags: [],
    last_active_at: new Date(Date.now() - 86400000 * 40).toISOString(),
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
]

export const demoCodes: OwnerCode[] = [
  {
    id: 'code1',
    owner_id: 'demo-owner',
    code: 'COACH-ALEX-2026',
    label: 'Spring invite',
    code_type: 'promo',
    max_uses: 50,
    use_count: 12,
    active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
  },
  {
    id: 'code2',
    owner_id: 'demo-owner',
    code: 'REF-FRIEND',
    label: 'Referral',
    code_type: 'referral',
    max_uses: null,
    use_count: 3,
    active: true,
    expires_at: null,
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
]

export const demoTasks: OwnerTask[] = [
  {
    id: 't1',
    owner_id: 'demo-owner',
    topic_id: null,
    title: 'Complete weekly focus review',
    description: 'Reflect on wins and blockers in NotioX.',
    due_at: new Date(Date.now() + 86400000 * 3).toISOString(),
    priority: 'high',
    status: 'open',
    created_at: new Date().toISOString(),
  },
  {
    id: 't2',
    owner_id: 'demo-owner',
    topic_id: null,
    title: 'Log sleep for 5 nights',
    description: null,
    due_at: new Date(Date.now() + 86400000 * 7).toISOString(),
    priority: 'medium',
    status: 'open',
    created_at: new Date().toISOString(),
  },
]

export const demoAssignments: OwnerTaskAssignment[] = [
  {
    id: 'a1',
    owner_id: 'demo-owner',
    task_id: 't1',
    client_id: 'c1',
    status: 'completed',
    completed_at: new Date().toISOString(),
  },
  {
    id: 'a2',
    owner_id: 'demo-owner',
    task_id: 't1',
    client_id: 'c2',
    status: 'pending',
    completed_at: null,
  },
  {
    id: 'a3',
    owner_id: 'demo-owner',
    task_id: 't2',
    client_id: 'c1',
    status: 'in_progress',
    completed_at: null,
  },
]

export const demoCampaigns: EmailCampaign[] = []

export function demoInsights(): DashboardInsights {
  const active = demoClients.filter((c) => c.status === 'active').length
  const invited = demoClients.filter((c) => c.status === 'invited').length
  const inactive = demoClients.filter(
    (c) => c.status === 'inactive' || c.status === 'churned',
  ).length
  const completed = demoAssignments.filter((a) => a.status === 'completed').length
  const total = demoAssignments.length
  return {
    totalClients: demoClients.length,
    activeClients: active,
    invitedClients: invited,
    inactiveClients: inactive,
    taskCompletionRate: total ? Math.round((completed / total) * 100) : 0,
    openTasks: demoTasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length,
    completedAssignments: completed,
    totalAssignments: total,
    activeCodes: demoCodes.filter((c) => c.active).length,
    revenuePlaceholder: {
      mtdCents: 0,
      currency: 'USD',
      note: 'Stripe not configured — revenue is a placeholder until keys are provided.',
    },
  }
}

/** Mutable demo bags for local create/assign flows without Supabase */
export const demoStore = {
  clients: [...demoClients],
  codes: [...demoCodes],
  tasks: [...demoTasks],
  assignments: [...demoAssignments],
  campaigns: [...demoCampaigns] as EmailCampaign[],
  owner: { ...demoOwner },
}
