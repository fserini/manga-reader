import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyListItems } from '../db.js';
import { loadListFilter, saveListFilter, matchesFilter, sortItems, previewSort } from '../myList.js';
import ListChips from './ListChips.jsx';
import MyListTile from './MyListTile.jsx';
import Icon from './Icon.jsx';
import './MySeriesCard.css';

// Tetto ai titoli disegnati nell'anteprima: la griglia ne mostra quanti ne
// entrano in UNA riga (3 sul telefono, 5 sul tablet), gli altri restano nascosti.
const PREVIEW_COUNT = 5;

// La card "Le mie serie" del Profilo (Fase 34): i quattro filtri a chip con i
// numeri, e sotto una riga di anteprima dei titoli del filtro scelto. Toccando
// la card (non i chip) si apre la lista completa, già su quel filtro. Il filtro
// scelto si ricorda da una visita all'altra.
function MySeriesCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState(loadListFilter);

  useEffect(() => {
    let cancelled = false;
    getMyListItems()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setItems([]); // senza dati la card resta utilizzabile, vuota
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseFilter(next) {
    setFilter(next);
    saveListFilter(next);
  }

  const openList = () => navigate('/profilo/serie');
  const visible = items ? sortItems(items.filter((item) => matchesFilter(item, filter)), previewSort(filter)) : [];

  return (
    <section className="my-series-card" aria-labelledby="my-series-title">
      <button type="button" className="my-series-head" onClick={openList}>
        <span id="my-series-title" className="my-series-title">
          {t('myList.title')}
          {items && <span className="my-series-count">{t(`myList.count`, { count: visible.length })}</span>}
        </span>
        <Icon name="chevron" size={18} />
      </button>

      {items === null ? (
        <p className="my-series-note">{t('myList.loading')}</p>
      ) : (
        <>
          <ListChips items={items} value={filter} onChange={chooseFilter} />
          {visible.length > 0 ? (
            <div
              className="my-series-rail"
              role="button"
              tabIndex={0}
              aria-label={t('myList.openAria')}
              onClick={openList}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openList();
                }
              }}
            >
              {visible.slice(0, PREVIEW_COUNT).map((item) => (
                <MyListTile key={item.key} item={item} preview />
              ))}
            </div>
          ) : (
            <p className="my-series-empty">
              <Icon name="inbox" size={22} />
              <span>{t(`myList.empty.${filter}`)}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}

export default MySeriesCard;
