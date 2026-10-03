import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getContinueTarget } from '../db.js';
import {
  isFileSystemAccessSupported,
  pickFile,
  getFileExtension,
  SUPPORTED_FORMATS_LABEL,
} from '../fileAccess.js';
import { resolveFileToChapter } from '../importFiles.js';
import { useChapterOpener } from '../useChapterOpener.js';
import ContinueCard from '../components/ContinueCard.jsx';
import ReadingSections from '../components/ReadingSections.jsx';
import Icon from '../components/Icon.jsx';
import './ReaderHome.css';

const supported = isFileSystemAccessSupported();

// La scheda Lettore quando nessun capitolo è aperto (Fase 29b, ADR-002). Prima
// era un solo pulsante "Scegli file", rimasto dalla Fase 3: un file scelto da lì
// si leggeva "a vuoto", senza ritrovare pagina, segnalibro, preferiti né
// statistiche, e senza salvare nulla. Ora è ciò che si sta leggendo (continua,
// in corso, ultimi letti) e un file aperto da qui viene riconosciuto in
// libreria per nome, o importato, e poi aperto come ogni altro capitolo.
function ReaderHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [target, setTarget] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setTarget(await getContinueTarget());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getContinueTarget();
      if (cancelled) return;
      setTarget(next);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { open, notice } = useChapterOpener({ onFileGone: reload });

  function describeFailure(outcome, fileName) {
    const extension = getFileExtension(fileName);
    if (outcome.reason === 'unsupported') {
      return t('reader.unsupportedFile', {
        format: extension ? `.${extension}` : '—',
        formats: SUPPORTED_FORMATS_LABEL,
      });
    }
    if (outcome.reason === 'encrypted') return t('reader.encryptedFile');
    if (outcome.reason === 'timeout') return t('reader.archiveTimeout');
    return t('reader.invalidFile', { format: extension ? extension.toUpperCase() : '?' });
  }

  async function handleOpenFile() {
    setMessage(null);
    setBusy(true);
    try {
      const handle = await pickFile();
      const outcome = await resolveFileToChapter(handle);
      if (!outcome.ok) {
        setMessage(describeFailure(outcome, handle.name));
        return;
      }
      navigate(`/reader/${outcome.chapterId}`);
    } catch (err) {
      // L'utente ha chiuso il selettore senza scegliere: non è un errore.
      if (err.name !== 'AbortError') setMessage(t('library.importError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page reader-home">
      <div className="page-heading">
        <span className="page-eyebrow" aria-hidden="true">
          頁
        </span>
        <h1>{t('nav.reader')}</h1>
      </div>

      {target && <ContinueCard target={target} onOpen={open} />}
      {notice && (
        <p className="reader-home-error" role="alert">
          {notice}
        </p>
      )}

      <ReadingSections onChanged={reload} />

      {loaded && !target && <p className="reader-home-empty">{t('readerHome.empty')}</p>}

      <div className="reader-home-open">
        {supported ? (
          <>
            <button type="button" className="reader-home-button" onClick={handleOpenFile} disabled={busy}>
              <Icon name="file" />
              {t(busy ? 'readerHome.opening' : 'readerHome.openFile')}
            </button>
            <p className="reader-home-hint">{t('readerHome.hint')}</p>
          </>
        ) : (
          <p className="reader-home-error" role="alert">
            {t('library.unsupportedBrowser')}
          </p>
        )}
        {message && (
          <p className="reader-home-error" role="alert">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

export default ReaderHome;
