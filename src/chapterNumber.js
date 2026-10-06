// Il numero del capitolo che il nome di un file lascia intuire (Fase 38), per
// precompilare il campo nella categorizzazione. È solo un suggerimento: il campo
// resta modificabile, e nel dubbio è meglio NON suggerire niente che suggerire il
// numero sbagliato. Del nome del file non si usa altro (titolo e volume restano
// vuoti, decisione della Fase 33).
//
// Regole, in ordine:
// 1. si toglie l'estensione e tutto ciò che sembra un numero ma non lo è:
//    risoluzioni (1080p), codec (x264), anni (1999, 2024), e i volumi ("vol 3",
//    "volume 3", "tome 3", "v3");
// 2. se c'è una parola chiave del capitolo ("cap", "capitolo", "ch", "chapter",
//    "c" o "#") seguita da un numero, vale quel numero;
// 3. altrimenti, se nel nome è rimasto UN solo numero, vale quello;
// 4. altrimenti (nessun numero, o più numeri senza una parola chiave: non si sa
//    quale sia) niente.
//
// Restituisce il numero come testo da mettere nel campo ("4", "12.5"), o ''.
const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;

// "c" da solo è una parola chiave solo se non fa parte di un'altra parola.
const CHAPTER_KEYWORD = new RegExp(
  String.raw`(?<![a-z])(?:capitolo|chapter|chap|cap|ch|c|#)\.?[\s_-]*${NUMBER}`,
  'i',
);

export function guessChapterNumber(fileName) {
  let name = fileName.replace(/\.[a-z0-9]{2,4}$/i, '');
  name = name
    .replace(/\b\d{3,4}p\b/gi, ' ') // 720p, 1080p
    .replace(/\b[xh]\.?26[45]\b/gi, ' ') // x264, h265
    .replace(/(?<![a-z])(?:volume|vol|tome|tomo|v)\.?[\s_-]*\d+(?:[.,]\d+)?/gi, ' ') // volumi
    .replace(/(?<!\d)(?:19|20)\d{2}(?!\d)/g, ' '); // anni

  const keyword = name.match(CHAPTER_KEYWORD);
  if (keyword) return normalize(keyword[1]);

  const numbers = name.match(/\d+(?:[.,]\d+)?/g) ?? [];
  return numbers.length === 1 ? normalize(numbers[0]) : '';
}

// "004" → "4", "12,5" → "12.5": lo stesso numero che si scriverebbe a mano.
function normalize(text) {
  const value = Number(text.replace(',', '.'));
  return Number.isFinite(value) ? String(value) : '';
}
