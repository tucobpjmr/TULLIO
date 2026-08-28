// src/test/scripts/guardiaDiSoloSmontaggio.test.js
//
// Suggerimento strategico n. 1 dell'audit del 28 agosto · Il presidio del
// confine fra le tre risposte a «la risposta è arrivata tardi, la scarto?».
//
// In un file suo e non dentro `verificaConvenzioni.test.js` per una ragione
// misurata: quel file era a 485 righe e questi casi lo portavano a 563, cioè
// oltre il tetto `max-lines`, che dal 23 agosto non ha deroghe. Il taglio non
// è però solo aritmetico — questo controllo ha un perimetro DICHIARATO
// (`src/components/**`) e due controlli positivi di sé stesso, e sono quelli
// che vanno letti insieme al codice che presidiano.
//
// ⚠️ Il primo caso riproduce la forma ESATTA di `TaskAttachments.jsx` prima di
// M-1: la guardia c'era, ed era metà. Un controllo che non trova il difetto che
// esiste per trovare non controlla niente.

import { describe, it, expect } from 'vitest';
import {
  LetturaFallita, guardiaDiSoloSmontaggio,
} from '../../../scripts/verifica-convenzioni/convenzioni.js';

describe('guardiaDiSoloSmontaggio', () => {
  // Il presupposto che il controllo esige per non essere vacuo: qualcuno usa
  // il contratto giusto, e qualche componente usa quello dei gestori.
  const conContratto = {
    path: 'src/components/clients/ClientiView.jsx',
    testo: 'import { useCaricamento } from "../../hooks/useCaricamento.js";',
  };
  const gestoreLegittimo = {
    path: 'src/components/admin/BulkInviteModal.jsx',
    testo: `import { useIsMounted } from "../../hooks/useIsMounted.js";
      const montato = useIsMounted();
      const invia = async () => { await Users.invite(x); if (!montato()) return; setEsito(1); };`,
  };

  it('segnala il caricamento in un useEffect guardato dal solo smontaggio', () => {
    // La forma ESATTA di TaskAttachments.jsx prima di M-1 (28 agosto), che è il
    // modo in cui questo difetto si presenta: la guardia c'è, ed è metà.
    const sorgenti = [conContratto, {
      path: 'src/components/tasks/TaskAttachments.jsx',
      testo: `import { useIsMounted } from "../../hooks/useIsMounted.js";
        const montato = useIsMounted();
        const load = useCallback(async () => {
          const { data } = await TaskFiles.listForTask(taskId);
          if (!montato()) return;
          setFiles(data || []);
        }, [taskId, montato]);
        useEffect(() => { load(); }, [load]);`,
    }];
    expect(guardiaDiSoloSmontaggio(sorgenti))
      .toEqual(['src/components/tasks/TaskAttachments.jsx']);
  });

  it('accetta `useIsMounted` in un componente SENZA effetti: è il caso dei gestori', () => {
    expect(guardiaDiSoloSmontaggio([conContratto, gestoreLegittimo])).toEqual([]);
  });

  it('accetta il componente passato a `useCaricamento`: l\'effetto non è più suo', () => {
    const sorgenti = [conContratto, {
      path: 'src/components/tasks/TaskAttachments.jsx',
      testo: `import { useIsMounted } from "../../hooks/useIsMounted.js";
        import { useCaricamento } from "../../hooks/useCaricamento.js";
        const { dato: files } = useCaricamento(() => TaskFiles.listForTask(taskId), [taskId]);
        const montato = useIsMounted();`,
    }];
    expect(guardiaDiSoloSmontaggio(sorgenti)).toEqual([]);
  });

  it('non si fa ingannare da un `useEffect(` scritto in un COMMENTO', () => {
    // TaskHistoryPanel ne ha uno che spiega perché non serve una useEffect
    // separata: un controllo rosso sui file spiegati meglio sarebbe il
    // contrario di ciò che serve.
    const sorgenti = [conContratto, {
      path: 'src/components/tasks/TaskHistoryPanel.jsx',
      testo: `import { useIsMounted } from "../../hooks/useIsMounted.js";
        // la sottoscrizione idrata da sé: non serve una useEffect(() => …) accanto
        /* nemmeno una useEffect( in blocco */
        const montato = useIsMounted();`,
    }];
    expect(guardiaDiSoloSmontaggio(sorgenti)).toEqual([]);
  });

  it('NON guarda src/hooks/: è il layer in cui gli effetti sono la materia', () => {
    // `useSalvataggio` importa `useIsMounted` per il proprio gestore e ha un
    // `useEffect` che tiene fresco un ref. La prima stesura di questo controllo,
    // senza perimetro, lo segnalava: è il motivo per cui il perimetro esiste.
    const sorgenti = [conContratto, gestoreLegittimo, {
      path: 'src/hooks/useSalvataggio.js',
      testo: `import { useIsMounted } from "./useIsMounted.js";
        const montato = useIsMounted();
        useEffect(() => { rif.current = { esegui, alSuccesso }; });`,
    }];
    expect(guardiaDiSoloSmontaggio(sorgenti)).toEqual([]);
  });

  it('SOLLEVA se nessun componente usa `useIsMounted`: il perimetro è vuoto', () => {
    expect(() => guardiaDiSoloSmontaggio([conContratto]))
      .toThrow(LetturaFallita);
  });

  it('SOLLEVA se nessuno importa `useCaricamento`: la diagnosi resta senza rimedio', () => {
    expect(() => guardiaDiSoloSmontaggio([gestoreLegittimo]))
      .toThrow(LetturaFallita);
  });
});
