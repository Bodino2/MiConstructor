# MiConstructor

MVP full-stack pentru un marketplace de construcții și reforme în Spania.
Pagina principală este publică, iar platforma demonstrativă este separată și
poate fi explorată fără login obligatoriu.

## Rute

- `/` — site-ul public văzut de orice vizitator;
- `/demo` — dashboard interactiv cu perspectivă client/profesionist;
- `/api/v1/usuarios/registro` — profil și consimțământ RGPD;
- `/api/v1/proyectos` — proiecte și hitos;
- `/api/v1/propuestas` — propuneri profesionale;
- `/api/v1/hitos/:id` — tranziții controlate pentru hitos.

## Funcționalități

- interfață responsive în spaniolă;
- validare NIF, NIE, CIF și email;
- dovada consimțământului RGPD, cu versiune și dată;
- profil client sau profesionist;
- proiecte împărțite în 2–8 hitos;
- sume păstrate în cenți pentru calcule exacte;
- marketplace și propuneri profesionale;
- persistență D1 cu migrații Drizzle;
- CI pentru lint, build, teste și audit de securitate.

## Reguli de business aplicate

1. Un proiect fără garanție poate fi publicat.
2. Dacă proiectul cere garanție, publicarea necesită `GuaranteeCharge.status = PAID`.
3. Trecerea în `IN_PROGRESS` este permisă numai cu escrow `HELD`.
4. Trecerea în `COMPLETED` pornește o fereastră de verificare de 7 zile.
5. Eliberarea automată este permisă după termen numai dacă nu există dispută.

> Depozitul în garanție este simulat în MVP. Înainte de lansarea comercială
> trebuie integrat un furnizor de plăți autorizat și validate textele juridice.

## Dezvoltare

Cerință: Node.js `>=22.13.0`.

```bash
npm ci
npm run dev
```

## Verificare

```bash
npm run lint
npm test
npm audit --omit=dev --audit-level=high
```

`npm test` construiește și validează artefactul de producție, apoi rulează
testele pentru identitatea vizuală și validările de date.
