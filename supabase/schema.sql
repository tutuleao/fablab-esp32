-- ---------------------------------------------------------------------------
-- REDE FAB LAB PRESIDENTE PRUDENTE — esquema do Supabase
-- Execute este arquivo no SQL Editor do seu projeto Supabase.
-- ---------------------------------------------------------------------------

-- Usuários (professores e administrador)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null,
  role text not null default 'user' check (role in ('user', 'admin')),
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- Login sempre em minúsculas
create unique index if not exists users_username_lower_key
  on public.users (lower(username));

-- Máquinas do Fab Lab
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists machines_name_lower_key
  on public.machines (lower(name));

-- Agendamentos da sala
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  user_name text not null,
  user_login text not null,
  date date not null,
  week_start date not null,
  day_key text not null,
  slots jsonb not null default '[]'::jsonb,
  start_time text not null,
  end_time text not null,
  room text not null,
  students integer not null default 0,
  purpose text not null,
  machine_id uuid references public.machines (id) on delete set null,
  machine_name text,
  created_at timestamptz not null default now()
);

create index if not exists bookings_date_idx on public.bookings (date);

-- Alunos enviados ao Fab Lab
create table if not exists public.student_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  user_name text not null,
  user_login text not null,
  room text not null,
  purpose text not null,
  students integer not null default 0,
  avg_time text not null,
  created_at timestamptz not null default now()
);

create index if not exists student_visits_user_idx on public.student_visits (user_id);

-- ---------------------------------------------------------------------------
-- Segurança
-- O app acessa o banco apenas pelo servidor (Vercel) usando a chave
-- service_role, que ignora RLS. O navegador nunca recebe essa chave.
-- Com RLS ativado e sem políticas públicas, as chaves anon/authenticated
-- não conseguem ler nem escrever nada.
-- ---------------------------------------------------------------------------

alter table public.users enable row level security;
alter table public.machines enable row level security;
alter table public.bookings enable row level security;
alter table public.student_visits enable row level security;

-- ---------------------------------------------------------------------------
-- Observação sobre os dados iniciais
-- O próprio servidor cria os usuários e as máquinas iniciais na primeira
-- requisição, caso as tabelas estejam vazias:
--   professor / fablab123
--   admin / admin123
-- Troque essas senhas no painel administrativo após o primeiro acesso.
-- ---------------------------------------------------------------------------
