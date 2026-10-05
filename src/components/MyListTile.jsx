import { useTranslation } from 'react-i18next';
import { useObjectUrl } from '../useObjectUrl.js';
import Icon from './Icon.jsx';
import './MyListTile.css';

// Una tinta stabile per titolo, per il segnaposto senza copertina.
function hueOf(title) {
  let hue = 0;
  for (let i = 0; i < title.length; i += 1) hue = (hue * 31 + title.charCodeAt(i)) % 360;
  return hue;
}

function Cover({ item }) {
  const url = useObjectUrl(item.cover);
  if (url) return <img className="mlt-cover" src={url} alt="" />;
  const hue = hueOf(item.title);
  return (
    <div
      className="mlt-cover mlt-cover--placeholder"
      style={{ background: `linear-gradient(160deg, hsl(${hue} 34% 26%), hsl(${hue + 24} 38% 11%))` }}
      aria-hidden="true"
    >
      {item.title.charAt(0)}
    </div>
  );
}

// Un titolo della lista "Le mie serie" (Fase 34). Due usi:
// - anteprima nella card del Profilo (preview): non interattiva, il tocco va
//   alla card intera;
// - griglia della pagina completa: tocco per aprire, stella per i titoli in
//   libreria, "x" per togliere le voci manuali in modalità Modifica.
function MyListTile({ item, preview = false, editing = false, onOpen, onStar, onDelete }) {
  const { t } = useTranslation();
  const body = (
    <>
      <div className="mlt-cover-wrap">
        <Cover item={item} />
        {item.state === 'progress' && (
          <span className="mlt-bar" aria-hidden="true">
            <i style={{ width: `${item.pct}%` }} />
          </span>
        )}
        {!preview && item.manual && (
          <span className={`mlt-tag${item.lib ? ' mlt-tag--lib' : ''}`}>
            {t(item.lib ? 'myList.tagInLibrary' : 'myList.tagManual')}
          </span>
        )}
        {preview && item.fav && (
          <span className="mlt-star mlt-star--on mlt-star--mini" aria-hidden="true">
            <Icon name="star" size={12} />
          </span>
        )}
      </div>
      <span className="mlt-title">{item.title}</span>
    </>
  );

  const className = `mlt${item.manual && !item.lib ? ' mlt--manual' : ''}`;
  if (preview) return <div className={className}>{body}</div>;

  return (
    <div className={className}>
      <button type="button" className="mlt-open" onClick={() => onOpen(item)}>
        {body}
      </button>
      {item.lib && (
        <button
          type="button"
          className={`mlt-star${item.fav ? ' mlt-star--on' : ''}`}
          aria-pressed={item.fav}
          aria-label={t(item.fav ? 'myList.starRemove' : 'myList.starAdd', { title: item.title })}
          onClick={() => onStar(item)}
        >
          <Icon name="star" size={15} />
        </button>
      )}
      {editing && item.manual && (
        <button
          type="button"
          className="mlt-delete"
          aria-label={t('myList.deleteAria', { title: item.title })}
          onClick={() => onDelete(item)}
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export default MyListTile;
