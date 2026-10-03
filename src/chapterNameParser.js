// Suggerimenti per la categorizzazione (Fase 23): dal NOME DEL FILE si ricava,
// quando è possibile, la serie, il volume e il numero del capitolo.
//
// È solo un suggerimento: chi lo usa pre-compila i campi, che restano sempre
// modificabili, e se il nome non dice nulla i campi restano vuoti come prima.
// Per questo il parser è prudente: preferisce non rispondere che rispondere a caso.
//
// Il modulo non sa nulla di React né del database: funzioni pure, che si
// possono provare a parte.

// Volume: "v01", "vol.3", "Volume 12", "tome 4", "tomo 2". Il (?<![a-z]) evita
// di leggere una "v" in mezzo a una parola; (?!\d) di fermarsi a metà di un
// numero più lungo.
const VOLUME_RE = /(?<![\p{L}])(?:volume|vol|tomo|tome|v)[\s._-]*0*(\d{1,3})(?!\d)/iu;
// Capitolo: "c012", "ch.12", "chapter 7", "cap 3", "capitolo 12.5". I numeri
// decimali ("12.5", "12,5") sono capitoli speciali tra due numerati.
const CHAPTER_RE = /(?<![\p{L}])(?:chapter|chapitre|chap|capitolo|cap|ch|c)[\s._-]*0*(\d{1,4}(?:[.,]\d{1,2})?)(?!\d)/iu;
// Ultima risorsa, se non c'è nessuna sigla: un numero in fondo al nome
// ("Berserk 042"). Meno sicuro, quindi usato solo se resta una serie davanti.
const TRAILING_NUMBER_RE = /[\s._-]0*(\d{1,4}(?:[.,]\d{1,2})?)\s*$/u;

const BRACKET_GROUPS_RE = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/gu;
const MIN_SIMILAR_LENGTH = 4;

function toNumber(text) {
  return Number(text.replace(',', '.'));
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^./\\]{1,5}$/u, '');
}

// "One_Piece - " -> "One Piece": toglie separatori ai bordi e spazi doppi.
function cleanSeriesText(text) {
  const cleaned = text
    .replace(/_/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s.\-–—:,]+|[\s.\-–—:,]+$/gu, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

// { series, volume, chapter } ricavati dal nome del file; ogni campo è null se
// non si trova. `series` è il testo che precede la prima sigla di volume o
// capitolo, senza i gruppi tra parentesi ("[Scan Team]", "(Digital)").
export function parseChapterFileName(fileName) {
  const base = stripExtension(fileName).replace(/_/gu, ' ');
  // Le sigle possono stare anche tra parentesi, "One Piece (v03)": per cercarle
  // le parentesi si trasformano in spazi; per la serie, invece, si tolgono con
  // tutto il loro contenuto.
  const searchable = base.replace(/[[\](){}]/gu, ' ');
  const withoutGroups = base.replace(BRACKET_GROUPS_RE, ' ');

  const volumeMatch = VOLUME_RE.exec(searchable);
  const chapterMatch = CHAPTER_RE.exec(searchable);

  let seriesEnd = withoutGroups.length;
  for (const re of [VOLUME_RE, CHAPTER_RE]) {
    const match = re.exec(withoutGroups);
    if (match) seriesEnd = Math.min(seriesEnd, match.index);
  }
  let series = cleanSeriesText(withoutGroups.slice(0, seriesEnd));

  let volume = volumeMatch ? toNumber(volumeMatch[1]) : null;
  let chapter = chapterMatch ? toNumber(chapterMatch[1]) : null;

  if (chapter === null) {
    // Nessuna sigla: un numero in fondo vale come capitolo, ma solo se resta
    // una serie e non è già stato letto come volume.
    const trailing = TRAILING_NUMBER_RE.exec(withoutGroups);
    if (trailing && !volumeMatch) {
      const before = cleanSeriesText(withoutGroups.slice(0, trailing.index));
      if (before) {
        chapter = toNumber(trailing[1]);
        series = before;
      }
    }
  }

  // Un nome fatto solo di un numero ("001.cbz") è un capitolo senza serie.
  if (series && /^\d+(?:[.,]\d+)?$/u.test(series)) {
    if (chapter === null && volume === null) chapter = toNumber(series);
    series = null;
  }

  if (volume === null && chapter === null && !series) return { series: null, volume: null, chapter: null };
  return { series, volume, chapter };
}

// Forma "confrontabile" di un titolo: senza maiuscole, accenti, punteggiatura
// e spazi. "One-Piece", "one piece" e "ONE PIECE!" diventano uguali.
export function normalizeTitle(title) {
  return title
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

// La serie esistente che somiglia al testo ricavato dal nome del file, o null.
// Uguale una volta normalizzati, oppure uno contenuto nell'altro (con almeno 4
// caratteri: sotto, "One" si troverebbe in mezza libreria). Tra più candidate
// vince quella di lunghezza più vicina.
export function findSimilarSeries(guess, seriesList) {
  if (!guess) return null;
  const target = normalizeTitle(guess);
  if (!target) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const series of seriesList) {
    const candidate = normalizeTitle(series.title);
    if (!candidate) continue;
    const similar =
      candidate === target ||
      (Math.min(candidate.length, target.length) >= MIN_SIMILAR_LENGTH &&
        (candidate.includes(target) || target.includes(candidate)));
    if (!similar) continue;
    const distance = Math.abs(candidate.length - target.length);
    if (distance < bestDistance) {
      best = series;
      bestDistance = distance;
    }
  }
  return best;
}

// Il suggerimento completo per un file: ciò che dice il nome, più la serie
// esistente a cui somiglia (se c'è).
export function suggestForFileName(fileName, seriesList) {
  const parsed = parseChapterFileName(fileName);
  return { ...parsed, matchedSeries: findSimilarSeries(parsed.series, seriesList) };
}

// Il valore più frequente di un elenco (ignorando i null), o null. Per un
// gruppo di file serve a scegliere UN suggerimento: la serie o il volume che
// compaiono più spesso nei loro nomi.
export function mostCommon(values) {
  const counts = new Map();
  for (const value of values) {
    if (value == null) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}
