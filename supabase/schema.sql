create extension if not exists pgcrypto;

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  watchlist jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  source text,
  page text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscribers_status_idx on subscribers(status);
create index if not exists subscribers_created_at_idx on subscribers(created_at desc);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null,
  report_date text not null,
  title text not null,
  markdown_body text not null,
  html_body text not null,
  text_body text not null,
  source_items jsonb not null default '[]'::jsonb,
  status text not null default 'ready',
  model text,
  created_at timestamptz not null default now()
);

create index if not exists reports_type_date_idx on reports(report_type, report_date desc);
create index if not exists reports_status_idx on reports(status);

create table if not exists email_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid references subscribers(id) on delete set null,
  report_id uuid references reports(id) on delete set null,
  email text not null,
  status text not null,
  provider text not null default 'resend',
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists email_deliveries_report_id_idx on email_deliveries(report_id);
create index if not exists email_deliveries_status_idx on email_deliveries(status);

