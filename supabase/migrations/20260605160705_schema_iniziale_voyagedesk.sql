-- ============================================================
-- VoyageDesk — Schema iniziale (Fase 0a step 2 roadmap)
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R
-- (caveat #19 — drift repo↔DB). Versione DB: 20260605160705.

-- USERS (estende auth.users con profilo applicativo)
CREATE TABLE public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin','manager','agent','driver')),
  avatar      TEXT,
  color       TEXT,
  phone       TEXT,
  photo_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  pending     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_active ON public.users(active);

-- TASKS
CREATE TABLE public.tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  category         TEXT,
  priority         TEXT CHECK (priority IN ('bassa','media','alta','urgente')),
  status           TEXT NOT NULL DEFAULT 'da_fare'
                   CHECK (status IN ('da_fare','in_corso','in_attesa','fatto','annullato')),
  assignees        UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  client_id        TEXT,
  due_date         TIMESTAMPTZ,
  estimated_hours  NUMERIC(5,2),
  description      TEXT,
  deleted_at       TIMESTAMPTZ,
  created_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_status ON public.tasks(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_assignees ON public.tasks USING GIN (assignees);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);

-- COMMENTS (commenti sui task)
CREATE TABLE public.comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comments_task ON public.comments(task_id, created_at DESC);

-- NOTICES (bacheca)
CREATE TABLE public.notices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT NOT NULL,
  color       TEXT,
  pinned      BOOLEAN NOT NULL DEFAULT FALSE,
  author_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notices_pinned ON public.notices(pinned DESC, created_at DESC);

-- CONVERSATIONS (chat 1:1 e gruppo)
CREATE TABLE public.conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN ('direct','group')),
  name          TEXT,
  icon          TEXT,
  participants  UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conversations_participants ON public.conversations USING GIN (participants);

-- MESSAGES
CREATE TABLE public.messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type             TEXT NOT NULL DEFAULT 'text'
                   CHECK (type IN ('text','voice','file','image','system')),
  text             TEXT,
  file_name        TEXT,
  file_size        BIGINT,
  file_type        TEXT,
  duration         INTEGER,
  waveform         JSONB,
  reply_to         UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  task_ref         UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  reactions        JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_by          UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_task_ref ON public.messages(task_ref) WHERE task_ref IS NOT NULL;

-- TRIGGER updated_at automatico
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- TRIGGER: alla creazione di un utente in auth.users, crea profilo in public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, pending)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'agent'),
    TRUE
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
