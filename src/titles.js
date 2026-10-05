// Confronto tra titoli. Serve al database per riconoscere due serie con lo stesso
// titolo scritto in modo diverso (rinomina, Fase 27; lista, Fase 34).
//
// Forma "confrontabile" di un titolo: senza maiuscole, accenti, punteggiatura e
// spazi. "One-Piece", "one piece" e "ONE PIECE!" diventano uguali.
export function normalizeTitle(title) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}
