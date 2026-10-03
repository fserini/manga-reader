// Dimensione in forma leggibile ("820 KB", "34,2 MB"), con il separatore
// decimale della lingua corrente. Le stime del backup sono indicative: sotto
// il MB basta il KB intero, sopra una cifra decimale.
export function formatBytes(bytes, locale) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(locale)} KB`;
  }
  const value = bytes / (1024 * 1024);
  const digits = value < 100 ? 1 : 0;
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} MB`;
}
