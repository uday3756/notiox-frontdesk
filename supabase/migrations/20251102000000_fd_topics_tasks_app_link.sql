-- Front Desk topics, per-client tasks, and client-app connection (shared NotioX backend).
-- doctor_id = public.doctors.id (same project as the student app).

create table if not exists public.fd_topics (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.fd_tasks (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  topic_id uuid references public.fd_topics (id) on delete set null,
  title text not null,
  description text,
  due_at timestamptz,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.fd_task_assignments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors (id) on delete cascade,
  task_id uuid not null references public.fd_tasks (id) on delete cascade,
  patient_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, patient_id)
);

create table if not exists public.fd_app_connections (
  doctor_id uuid primary key references public.doctors (id) on delete cascade,
  virtual_domain text not null,
  school_domain text,
  api_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fd_topics_doctor_idx on public.fd_topics (doctor_id);
create index if not exists fd_tasks_doctor_idx on public.fd_tasks (doctor_id);
create index if not exists fd_tasks_topic_idx on public.fd_tasks (topic_id);
create index if not exists fd_assign_patient_idx on public.fd_task_assignments (patient_id);
create index if not exists fd_assign_task_idx on public.fd_task_assignments (task_id);
create index if not exists fd_app_key_idx on public.fd_app_connections (api_key);

alter table public.fd_topics enable row level security;
alter table public.fd_tasks enable row level security;
alter table public.fd_task_assignments enable row level security;
alter table public.fd_app_connections enable row level security;

-- Owners (doctors.user_id = auth.uid()) manage their rows.
create policy fd_topics_owner on public.fd_topics
  for all using (doctor_id in (select id from public.doctors where user_id = auth.uid()))
  with check (doctor_id in (select id from public.doctors where user_id = auth.uid()));

create policy fd_tasks_owner on public.fd_tasks
  for all using (doctor_id in (select id from public.doctors where user_id = auth.uid()))
  with check (doctor_id in (select id from public.doctors where user_id = auth.uid()));

create policy fd_assign_owner on public.fd_task_assignments
  for all using (doctor_id in (select id from public.doctors where user_id = auth.uid()))
  with check (doctor_id in (select id from public.doctors where user_id = auth.uid()));

create policy fd_app_owner on public.fd_app_connections
  for all using (doctor_id in (select id from public.doctors where user_id = auth.uid()))
  with check (doctor_id in (select id from public.doctors where user_id = auth.uid()));

-- Linked patients can read their own assignments + parent task/topic (student app).
create policy fd_assign_patient_read on public.fd_task_assignments
  for select using (patient_id = auth.uid());

create policy fd_tasks_patient_read on public.fd_tasks
  for select using (
    id in (select task_id from public.fd_task_assignments where patient_id = auth.uid())
  );

create policy fd_topics_patient_read on public.fd_topics
  for select using (
    id in (
      select t.topic_id from public.fd_tasks t
      join public.fd_task_assignments a on a.task_id = t.id
      where a.patient_id = auth.uid() and t.topic_id is not null
    )
  );

comment on table public.fd_topics is 'Front Desk subjects/topics created by owners; student app lists these.';
comment on table public.fd_tasks is 'Front Desk tasks under a topic; assigned per client.';
comment on table public.fd_task_assignments is 'Per-client assignment of a Front Desk task (student app inbox).';
comment on table public.fd_app_connections is 'Virtual/school domain + API key the student app uses to plug into this owner.';
