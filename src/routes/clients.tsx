import { Outlet, createFileRoute } from '@tanstack/react-router'
import { FeatureGate } from '~/components/FeatureGate'

export const Route = createFileRoute('/clients')({
  component: () => (
    <FeatureGate feature="clients">
      <Outlet />
    </FeatureGate>
  ),
})
