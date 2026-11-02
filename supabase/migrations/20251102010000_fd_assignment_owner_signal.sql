-- Owner work-signal override on assignments + patient self-update for status.

alter table public.fd_task_assignments
  add column if not exists owner_signal text
  check (owner_signal is null or owner_signal in ('on_track', 'needs_attention', 'at_risk'));

comment on column public.fd_task_assignments.owner_signal is
  'Optional owner override for productivity signal; null means use computed signal.';

-- Linked patients can update their own assignment status / completed_at (student app).
drop policy if exists fd_assign_patient_update on public.fd_task_assignments;
create policy fd_assign_patient_update on public.fd_task_assignments
  for update
  using (patient_id = auth.uid())
  with check (patient_id = auth.uid());
