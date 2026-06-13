-- ─── CLIENTI ───────────────────────────────────────────────────────────────
-- Versione DB: 20260608115454
CREATE TABLE public.clients (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  email       text,
  phone       text,
  address     text,
  city        text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "clients_delete" ON public.clients
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- ─── FORNITORI ─────────────────────────────────────────────────────────────
CREATE TABLE public.suppliers (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  category    text        CHECK (category IN ('hotel','volo','transfer','tour_operator','assicurazione','crociera','altro')),
  email       text,
  phone       text,
  address     text,
  city        text,
  country     text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "suppliers_select" ON public.suppliers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "suppliers_insert" ON public.suppliers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "suppliers_update" ON public.suppliers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "suppliers_delete" ON public.suppliers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- ─── PRATICHE ──────────────────────────────────────────────────────────────
CREATE TABLE public.dossiers (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  number          text        UNIQUE NOT NULL,  -- PR-2026-001
  title           text        NOT NULL,
  status          text        NOT NULL DEFAULT 'bozza'
                              CHECK (status IN ('bozza','confermata','in_corso','completata','annullata')),
  client_id       uuid        REFERENCES public.clients(id) ON DELETE SET NULL,
  destination     text,
  departure_date  date,
  return_date     date,
  pax_adults      integer     NOT NULL DEFAULT 0,
  pax_children    integer     NOT NULL DEFAULT 0,
  budget_total    numeric(12,2),
  notes           text,
  created_by      uuid        REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dossiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dossiers_select" ON public.dossiers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dossiers_insert" ON public.dossiers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "dossiers_update" ON public.dossiers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );
CREATE POLICY "dossiers_delete" ON public.dossiers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager'))
  );

-- ─── PRATICA ↔ FORNITORE ───────────────────────────────────────────────────
CREATE TABLE public.dossier_suppliers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dossier_id   uuid        NOT NULL REFERENCES public.dossiers(id) ON DELETE CASCADE,
  supplier_id  uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  service_type text,
  cost         numeric(12,2),
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dossier_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dossier_suppliers_select" ON public.dossier_suppliers
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "dossier_suppliers_write" ON public.dossier_suppliers
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager','agent'))
  );

-- ─── COLLEGA tasks → dossier ───────────────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN dossier_id uuid REFERENCES public.dossiers(id) ON DELETE SET NULL;

-- ─── NUMERAZIONE AUTOMATICA PRATICA ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.next_dossier_number()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  yr  text := to_char(now(), 'YYYY');
  seq int;
BEGIN
  SELECT COUNT(*) + 1 INTO seq
    FROM public.dossiers
   WHERE number LIKE 'PR-' || yr || '-%';
  RETURN 'PR-' || yr || '-' || LPAD(seq::text, 3, '0');
END;
$$;
