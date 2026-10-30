# SubwaySimulator3000

Gioco gestionale di metropolitana nel browser: costruisci la rete di New York, guarda la città crescere dove il servizio è buono, salva e torna a lavorarci quando vuoi.

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

- **Stazione**: tocca la terraferma per costruire una stazione. Il cerchio tratteggiato è il bacino pedonale.
- **Linee**: trascina da una stazione all'altra; passando su più stazioni le colleghi in fila. Tornando indietro annulli l'ultima.
  - Prolunga una linea trascinando la "T" a un capolinea.
  - Seleziona una linea e trascina un suo tratto su una stazione per aggiungere una fermata in mezzo.
- Fiumi e baie si attraversano con una **galleria** (più costosa). Il cerchio con la "T" la segnala.
- I passeggeri sono pallini del colore della zona dove vogliono andare. La domanda cambia con l'ora:
  al mattino si va al lavoro e a scuola, a pranzo al cibo, la sera a casa e allo svago.
- Ogni viaggio paga un biglietto. Gli isolati vicini alle stazioni più usate si densificano e i terreni liberi vengono edificati.
- Più abitanti servi, più sali di livello: più linee e treni più capienti. Gli obiettivi danno premi in denaro.
- Imprevisti moderati (guasti, allagamenti nelle gallerie, picchi di domanda, cantieri): si regolano o disattivano dal menu.
- Nessun game over. Pausa e velocità dalla barra in alto (tastiera: spazio, 1, 2, 3; L/S/D per gli strumenti).

## Salvataggi

Salvataggio automatico ogni 45 secondi e quando chiudi la scheda, più 3 slot manuali (IndexedDB nel browser).
"Esporta file" scarica un JSON da reimportare su un altro dispositivo.

## Crediti

- Mappa di New York stilizzata, disegnata a mano: non è in scala e non usa dati cartografici esterni.
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
