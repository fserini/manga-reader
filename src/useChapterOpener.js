import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { verifyPermission, fileStillExists } from './fileAccess.js';

// Apre un capitolo nel Lettore partendo da un elemento "arricchito" (con
// `handle` e `chapterId`, vedi enrichChapter in db.js). Il permesso di lettura
// sull'handle va (ri)chiesto durante un gesto dell'utente: per questo si
// chiama dal gestore di un tocco, prima di navigare al Lettore. Se il file non
// c'è più, avvisa e chiama onFileGone (così chi usa il hook può ricaricarsi).
//
// Restituisce `open` e l'eventuale `notice` (messaggio d'errore già tradotto).
export function useChapterOpener({ onFileGone } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState(null);

  const open = useCallback(
    async (item) => {
      setNotice(null);
      if (!item.handle) {
        setNotice(t('readingSections.notice.fileUnavailable'));
        return;
      }
      try {
        if (!(await verifyPermission(item.handle, 'read'))) {
          setNotice(t('readingSections.notice.permissionDenied'));
          return;
        }
        if (!(await fileStillExists(item.handle))) {
          setNotice(t('readingSections.notice.fileGone'));
          onFileGone?.();
          return;
        }
        navigate(`/reader/${item.chapterId}`);
      } catch {
        setNotice(t('readingSections.notice.accessError'));
      }
    },
    [navigate, onFileGone, t],
  );

  return { open, notice };
}
