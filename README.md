# SubwaySimulator3000

Gioco gestionale di metropolitana nel browser: costruisci la rete di New York o di Castelfranco Veneto, guarda la città crescere dove il servizio è buono, salva e torna a lavorarci quando vuoi.

Prototipo per validare le prime meccaniche.

## Avvio

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # versione statica in dist/
```

Ad ogni push su `main` il workflow `.github/workflows/pages.yml` pubblica il gioco su GitHub Pages
(va attivato una volta da Settings → Pages → Source: GitHub Actions).

## Come si gioca

- **Stazioni del sindaco**: le stazioni non le costruisci tu. Si parte con 12 stazioni nei quartieri centrali, poi il sindaco ne approva una nuova ogni mattina e due a ogni livello. All'inizio i soldi non bastano per collegarle tutte.
- **Linee**: trascina da una stazione all'altra; passando su più stazioni le colleghi in fila. Tornando indietro annulli l'ultima.
  - Prolunga una linea trascinando la "T" a un capolinea.
  - Seleziona una linea e trascina un suo tratto su una stazione per aggiungere una fermata in mezzo.
- Fiumi e baie si attraversano con una **galleria** (più costosa). Il cerchio con la "T" la segnala.
- I passeggeri sono pallini del colore della zona dove vogliono andare. La domanda cambia con l'ora:
  al mattino si va al lavoro e a scuola, a pranzo al cibo, la sera a casa e allo svago.
- Ogni viaggio paga un biglietto. Gli isolati vicini alle stazioni più usate si densificano e i terreni liberi vengono edificati.
- Più abitanti servi, più sali di livello: più linee, più treni per linea (5 al livello 1, fino a 12) e treni più capienti. Gli obiettivi danno premi in denaro.
- Imprevisti moderati (guasti, allagamenti nelle gallerie, picchi di domanda, cantieri): si regolano o disattivano dal menu.
- **Urgenza**:
  - una stazione con troppa gente in attesa avvia un conto alla rovescia (arco rosso). Allo scadere scatta la crisi: il quartiere perde densità e smette di crescere per un giorno, e il Comune ti multa ($400). Al massimo una crisi al giorno per stazione;
  - le stazioni non collegate accumulano malcontento (barra arancione). Al 100% i residenti protestano e la fiducia del sindaco cala;
  - il sindaco fa richieste a tempo ("collega X", "porta N persone verso…"), con premi o penalità;
  - la fiducia del sindaco (🏛️) decide quanta parte dei biglietti tieni, quanto costa costruire, il contributo giornaliero e se apre nuove stazioni. Sale ogni giorno con un buon servizio, con le richieste completate e con le donazioni al Comune;
  - sotto 25 di fiducia sei tu a pagare una compensazione giornaliera al Comune; sotto 10 il sindaco si prende la linea peggiore (grigia e tratteggiata): non puoi usarla né collegarti, e la riscatti a pagamento quando la fiducia torna a 20.
- La domanda di una stazione appena collegata parte bassa e cresce in circa un giorno e mezzo.
- Nessun game over. Pausa e velocità dalla barra in alto (tastiera: spazio, 1, 2, 3).

## Aggiornamenti

Ogni build pubblica `version.json`. Il gioco lo ricontrolla ogni 5 minuti e quando torni sulla scheda: se è uscita una versione nuova mostra un riquadro con le novità e il bottone "Aggiorna ora", che salva la partita e ricarica. Le novità si scrivono in `changelog.json`, con la voce più recente in cima.

## Salvataggi

Salvataggio automatico ogni 45 secondi e quando chiudi la scheda, più 3 slot manuali (IndexedDB nel browser).
"Esporta file" scarica un JSON da reimportare su un altro dispositivo.

## Crediti

- Mappe di New York e Castelfranco Veneto stilizzate, disegnate a mano: non sono in scala e non usano dati cartografici esterni. La città si sceglie da "Nuova partita"; ogni salvataggio ricorda la sua mappa.
- Musica generata in tempo reale con Web Audio (due atmosfere: jazz di città e chill hop da vlog): nessun brano registrato, nessun copyright di terzi.
- Font: Space Grotesk (SIL Open Font License) da Google Fonts.

## Struttura

| File | Contenuto |
| --- | --- |
| `src/nyc.ts` | geografia: distretti, acque, quartieri |
| `src/world.ts` | generazione degli isolati e della partita nuova |
| `src/network.ts` | geometria delle linee, bacini, instradamento |
| `src/sim.ts` | simulazione: passeggeri, treni, crescita, eventi, obiettivi |
| `src/render.ts` | disegno su canvas |
| `src/input.ts` | mouse, touch, pinch, disegno delle linee |
| `src/storage.ts` | salvataggi |
| `src/music.ts` | musica procedurale |
| `src/main.ts` | interfaccia e ciclo di gioco |
