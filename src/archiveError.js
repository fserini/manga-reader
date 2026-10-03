// Perché un file non si può leggere, in una forma che chi chiama sa tradurre in
// un messaggio (vedi le chiavi library.notice.* e reader.errors.*). Sta in un
// file a sé perché la usano sia gli archivi (comicFile.js) sia i PDF
// (pdfPages.js), e i due moduli non devono importarsi a vicenda.
export class ArchiveError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason; // 'invalid' | 'encrypted' | 'timeout'
  }
}
