create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  report_id uuid references reports(id) on delete set null,
  report_date text,
  path text,
  session_id text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_type_created_idx on analytics_events(event_type, created_at desc);
create index if not exists analytics_events_report_id_idx on analytics_events(report_id);
