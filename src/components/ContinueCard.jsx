import { useTranslation } from 'react-i18next';
import { useObjectUrl } from '../useObjectUrl.js';
import Icon from './Icon.jsx';
import './ContinueCard.css';

function percent(target) {
  if (!target.totalPages) return 0;
  return Math.round(((target.lastPageRead + 1) / target.totalPages) * 100);
}

// "Continua a leggere": il capitolo da cui riprendere (Fase 29b, ADR-002).
// Presentazionale — i dati (getContinueTarget) e l'apertura (useChapterOpener)
// li gestisce chi la usa. Sta solo nella scheda Lettore: la Libreria è ciò che
// si possiede, "Continua a leggere" è ciò che si sta leggendo (ADR-002).
function ContinueCard({ target, onOpen }) {
  const { t } = useTranslation();
  const coverUrl = useObjectUrl(target.thumbnail);

  const title = target.seriesTitle ?? target.fileName ?? '';
  const detail = [
    target.volumeNumber != null ? t('continue.volume', { number: target.volumeNumber }) : null,
    target.chapterNumber != null ? t('continue.chapter', { number: target.chapterNumber }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const hasProgress = !target.isNext && target.totalPages > 0;

  return (
    <section className="continue continue--large" aria-label={t('continue.label')}>
      <div className="continue-cover" aria-hidden="true">
        {coverUrl ? <img src={coverUrl} alt="" /> : <span>{title}</span>}
      </div>

      <div className="continue-body">
        <span className="continue-label">{target.isNext ? t('continue.next') : t('continue.label')}</span>
        <h2 className="continue-title">{title}</h2>
        {detail && <p className="continue-detail">{detail}</p>}
        {hasProgress && (
          <>
            <div className="continue-bar" aria-hidden="true">
              <i style={{ width: `${percent(target)}%` }} />
            </div>
            <p className="continue-detail continue-detail--page">
              {t('continue.page', { page: target.lastPageRead + 1, total: target.totalPages })} · {percent(target)}%
            </p>
          </>
        )}
      </div>

      <button type="button" className="continue-action" onClick={() => onOpen(target)}>
        <Icon name="play" filled size={16} />
        <span>{t(target.isNext ? 'continue.start' : 'continue.resume')}</span>
      </button>
    </section>
  );
}

export default ContinueCard;
