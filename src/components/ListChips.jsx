import { useTranslation } from 'react-i18next';
import { LIST_FILTERS, countFor } from '../myList.js';
import Icon from './Icon.jsx';
import './ListChips.css';

// I quattro filtri della lista "Le mie serie" (Fase 34) come chip con il
// numero di titoli, uno solo selezionato alla volta. Li usano la card del
// Profilo e la pagina completa.
function ListChips({ items, value, onChange }) {
  const { t } = useTranslation();

  return (
    <div className="list-chips" role="group" aria-label={t('myList.filterAria')}>
      {LIST_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          className="list-chip"
          aria-pressed={value === filter}
          onClick={() => onChange(filter)}
        >
          {filter === 'fav' && <Icon name="star" size={13} />}
          {t(`myList.filters.${filter}`)}
          <span className="list-chip-count">{countFor(items, filter)}</span>
        </button>
      ))}
    </div>
  );
}

export default ListChips;
