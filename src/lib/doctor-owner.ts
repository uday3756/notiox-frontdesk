import type { ClientStatus, Owner, OwnerClient, OwnerCode, OwnerRole } from './types'

export type DoctorRow = {
  id: string
  user_id: string
  full_name: string | null
  email: string
  specialty: string | null
  clinic_organization: string | null
  verified: boolean
  active: boolean
  password_must_change: boolean | null
  country: string | null
  timezone: string | null
  notes: string | null
}

/** Map NotioX doctor specialty → Front Desk role label */
export function specialtyToRole(specialty: string | null | undefined): OwnerRole {
  const s = (specialty || '').toLowerCase()
  if (s.includes('adhd')) return 'adhd_trainer'
  if (
    s.includes('psych') ||
    s.includes('neuro') ||
    s.includes('mental') ||
    s.includes('therap') ||
    s.includes('clinic')
  ) {
    return 'mental_health_doctor'
  }
  if (s.includes('coach')) return 'coach'
  if (s.includes('ugc') || s.includes('creator') || s.includes('content')) return 'ugc_creator'
  return 'other'
}

export function doctorToOwner(doctor: DoctorRow): Owner {
  return {
    id: doctor.id,
    email: doctor.email,
    full_name: doctor.full_name,
    role: specialtyToRole(doctor.specialty),
    brand_name: doctor.clinic_organization || doctor.full_name || 'Front Desk',
    brand_logo_url: null,
    custom_domain: null,
    custom_domain_verified: false,
    settings: {
      specialty: doctor.specialty,
      user_id: doctor.user_id,
      verified: doctor.verified,
      active: doctor.active,
      password_must_change: doctor.password_must_change,
      country: doctor.country,
      timezone: doctor.timezone,
      notes: doctor.notes,
      clinic_organization: doctor.clinic_organization,
    },
  }
}

export function linkToClient(opts: {
  link: {
    id: string
    patient_id: string
    doctor_id: string
    referral_code: string | null
    consent_status: string | null
    created_at: string
    revoked_at: string | null
  }
  profile?: {
    display_name?: string | null
    referral_code_used?: string | null
  } | null
  email?: string | null
}): OwnerClient {
  const status: ClientStatus =
    opts.link.revoked_at
      ? 'inactive'
      : opts.link.consent_status === 'granted'
        ? 'active'
        : opts.link.consent_status === 'pending'
          ? 'invited'
          : 'inactive'

  return {
    id: opts.link.patient_id,
    owner_id: opts.link.doctor_id,
    email: opts.email || `${opts.link.patient_id.slice(0, 8)}@client.local`,
    full_name: opts.profile?.display_name || null,
    status,
    code_id: null,
    notes: opts.link.referral_code ? `Code: ${opts.link.referral_code}` : null,
    tags: opts.link.referral_code ? [opts.link.referral_code] : [],
    last_active_at: null,
    created_at: opts.link.created_at,
  }
}

export function referralToCode(row: {
  id: string
  code: string
  doctor_id: string
  active: boolean
  campaign: string | null
  created_at: string
}): OwnerCode {
  return {
    id: row.id,
    owner_id: row.doctor_id,
    code: row.code,
    label: row.campaign,
    code_type: 'referral',
    max_uses: null,
    use_count: 0,
    active: row.active,
    expires_at: null,
    created_at: row.created_at,
  }
}
