-- Migration: trigger su auth.users per auto-creare public.users all'invito.
-- La Edge Function invite-user esegue già questo esplicitamente;
-- il trigger è un safety-net nel caso di timeout/errore post-inviteByEmail.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  meta  jsonb := NEW.raw_user_meta_data;
  uname text;
  urole text;
  ucap  int;
  ucol  text;
  uavat text;
  parts text[];
BEGIN
  uname := COALESCE(meta->>'name', split_part(NEW.email, '@', 1));
  urole := CASE
    WHEN meta->>'role' IN ('admin','manager','agent','driver') THEN meta->>'role'
    ELSE 'agent'
  END;
  ucap  := COALESCE((meta->>'capacity')::int, 8);
  ucol  := COALESCE(meta->>'color', '#3B82F6');

  -- Genera avatar dalle prime lettere delle parole del nome
  SELECT array_agg(word) INTO parts
  FROM unnest(string_to_array(uname, ' ')) AS word;
  uavat := UPPER(
    LEFT(COALESCE(parts[1], ''), 1) ||
    LEFT(COALESCE(parts[2], RIGHT(COALESCE(parts[1], '  '), 1)), 1)
  );

  INSERT INTO public.users (id, name, role, avatar, color, capacity, pending, active)
  VALUES (NEW.id, uname, urole, uavat, ucol, ucap, true, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_contacts (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Crea il trigger (DROP IF EXISTS per idempotenza)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
