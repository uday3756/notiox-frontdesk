import { env } from '~/lib/env'
import type { OwnerOffering, OwnerOfferingSection, OwnerOfferingSession } from '~/lib/types'

export function offeringSharePath(ownerId: string, offeringId: string) {
  return `/o/${ownerId}/${offeringId}`
}

export function offeringShareUrl(ownerId: string, offeringId: string, hash?: string) {
  const base = env.appUrl().replace(/\/$/, '')
  const path = offeringSharePath(ownerId, offeringId)
  return hash ? `${base}${path}#${hash}` : `${base}${path}`
}

export function googleTemplateUrl(session: OwnerOfferingSession, offering: OwnerOffering) {
  const start = session.starts_at.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const endSrc = session.ends_at || session.starts_at
  const end = endSrc.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const text = encodeURIComponent(`${offering.title}: ${session.title}`)
  const details = encodeURIComponent(offering.description || session.location || '')
  const location = encodeURIComponent(session.location || session.meeting_url || '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}&location=${location}`
}

export function catalogSummary(input: {
  offerings: OwnerOffering[]
  sections: OwnerOfferingSection[]
  sessions: OwnerOfferingSession[]
}) {
  return {
    offeringCount: input.offerings.length,
    sectionCount: input.sections.length,
    sessionCount: input.sessions.length,
  }
}
