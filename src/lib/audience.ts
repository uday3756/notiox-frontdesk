import type { AudienceKind, OwnerAudience } from '~/lib/types'

const PRESETS: Record<Exclude<AudienceKind, 'custom'>, { singular: string; plural: string }> = {
  client: { singular: 'client', plural: 'clients' },
  patient: { singular: 'patient', plural: 'patients' },
  student: { singular: 'student', plural: 'students' },
  member: { singular: 'member', plural: 'members' },
}

export function normalizeAudience(raw?: OwnerAudience | null): OwnerAudience {
  if (!raw || !raw.kind) return { kind: 'client' }
  if (raw.kind === 'custom') {
    return {
      kind: 'custom',
      singular: (raw.singular || 'client').trim() || 'client',
      plural: (raw.plural || 'clients').trim() || 'clients',
    }
  }
  return { kind: raw.kind }
}

export function audienceLabels(raw?: OwnerAudience | null) {
  const audience = normalizeAudience(raw)
  const base =
    audience.kind === 'custom'
      ? {
          singular: (audience.singular || 'client').trim() || 'client',
          plural: (audience.plural || 'clients').trim() || 'clients',
        }
      : PRESETS[audience.kind]
  const singular = base.singular
  const plural = base.plural
  const titleSingular = singular.charAt(0).toUpperCase() + singular.slice(1)
  const titlePlural = plural.charAt(0).toUpperCase() + plural.slice(1)
  return {
    kind: audience.kind,
    singular,
    plural,
    titleSingular,
    titlePlural,
    possessive: `${singular}'s`,
  }
}

export const AUDIENCE_PRESET_OPTIONS: { value: AudienceKind; label: string }[] = [
  { value: 'client', label: 'Client / clients' },
  { value: 'patient', label: 'Patient / patients' },
  { value: 'student', label: 'Student / students' },
  { value: 'member', label: 'Member / members' },
  { value: 'custom', label: 'Custom…' },
]
