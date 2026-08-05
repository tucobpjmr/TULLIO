-- Auto-genera dossiers.number nel formato PR-YYYY-NNN tramite sequence.
-- Si attiva solo se number è NULL o stringa vuota (permette di specificarlo manualmente).

CREATE SEQUENCE IF NOT EXISTS dossier_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_dossier_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'PR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('dossier_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dossiers_auto_number ON dossiers;
CREATE TRIGGER dossiers_auto_number
  BEFORE INSERT ON dossiers
  FOR EACH ROW EXECUTE FUNCTION generate_dossier_number();
