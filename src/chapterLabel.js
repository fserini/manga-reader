// Come chiamare un capitolo nell'interfaccia. Un capitolo non ancora
// categorizzato non ha un numero (è `null`): "Cap null" sarebbe un errore da
// vedere in chiaro, quindi si ricade sul nome del file — che oggi può
// comparire in "Continua a leggere" e "Ultimi letti" perché un file aperto dal
// Lettore viene importato senza essere categorizzato (Fase 29b).
export function chapterLabel(item, t, key = 'readingSections.chapterLabel') {
  if (item.chapterNumber == null) return item.fileName ?? '';
  return t(key, { number: item.chapterNumber });
}
