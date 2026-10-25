-- Real columns from Supabase (public schema). Don't send id or created_at, the DB fills them.

-- approvals (append-only log)
--   id bigint (auto), user_id uuid NOT NULL, notification_id text NOT NULL,
--   kind text NOT NULL, action text NOT NULL, message text NULL,
--   created_at timestamptz default now()

-- user_settings (one row per user, upsert on user_id)
--   user_id uuid NOT NULL, debt_guard boolean default false,
--   theme text default 'system', notifications_enabled boolean default true,
--   updated_at timestamptz default now()

-- profiles
--   id uuid NOT NULL (= auth user id), full_name text, school text,
--   payday date, pay_frequency text, created_at timestamptz default now()

-- impact_events (not used yet)
--   id bigint (auto), user_id uuid NOT NULL, kind text NOT NULL,
--   amount numeric NOT NULL, note text, created_at timestamptz default now()
