import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getMyListItems, getSeriesResumeTarget, removeListEntry, clearSeriesListInfo } from '../db.js';
import { LIST_SORTS, loadListFilter, saveListFilter, matchesFilter, sortItems } from '../myList.js';
import { useChapterOpener } from '../useChapterOpener.js';
import { useFavoriteToggle } from '../useFavoriteToggle.js';
import { chapterLabel } from '../chapterLabel.js';
import ListChips from '../components/ListChips.jsx';
import MyListTile from '../components/MyListTile.jsx';
import ListEntryDialog from '../components/ListEntryDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import WarningNotice from '../components/WarningNotice.jsx';
import { SkeletonList } from '../components/Skeleton.jsx';
import Icon from '../components/Icon.jsx';
import './MyList.css';

// La lista "Le mie serie" a pagina intera (Fase 34), a /profilo/serie: i
// quattro filtri, la ricerca, l'ordinamento e la griglia dei titoli. Il tocco su
// un titolo dipende dal suo stato (vedi openItem). Il "+" in alto aggiunge un
// titolo; con la matita si entra nella modalità Modifica, dove si cambiano titolo,
// stato e nota di ogni titolo e si tolgono le voci (Fase 37).
function MyList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState(loadListFilter);
  const [sort, setSort] = useState('read');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  // Finestra di aggiunta/modifica: { entry } con entry null per una voce nuova.
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(null);
  // Titolo in corso di cui si propone la ripresa: { item, target }.
  const [resume, setResume] = useState(null);
  const [warning, setWarning] = useState(null);
  const { open: openChapter, notice } = useChapterOpener();
  const toggleFavorite = useFavoriteToggle();

  const reload = useCallback(async () => {
    setItems(await getMyListItems());
  }, []);

  useEffect(() => {
    let cancelled = false;
    getMyListItems()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function chooseFilter(next) {
    setFilter(next);
    saveListFilter(next);
    setWarning(null);
  }

  // Cosa fa il tocco su un titolo:
  // - in modalità Modifica: la finestra di modifica (titolo, stato, nota);
  // - "in corso" e in libreria: la conferma per riprendere la lettura;
  // - in libreria: porta alla Libreria, direttamente sulla serie;
  // - altrimenti: un avviso giallo, il titolo non è in libreria.
  async function openItem(item) {
    setWarning(null);
    if (editing) {
      setDialog({ entry: item });
      return;
    }
    if (item.state === 'progress' && item.lib) {
      const target = await getSeriesResumeTarget(item.seriesId);
      if (target) {
        setResume({ item, target });
        return;
      }
    }
    if (item.lib) {
      navigate('/', { state: { openSeriesId: item.seriesId } });
      return;
    }
    setWarning(t(item.linkRemoved ? 'myList.removedFromLibrary' : 'myList.notInLibrary', { title: item.title }));
  }

  // La stella cambia e un avviso lo dice (con "Annulla" alla rimozione).
  function toggleStar(item) {
    return toggleFavorite(item.seriesId, item.title, reload);
  }

  // La "x" su una voce manuale la cancella; su una serie della libreria toglie
  // solo la stella e la voce manuale (la nota e lo stato scelto a mano): la serie
  // resta in libreria e nella lista, col suo stato di lettura.
  async function confirmDelete() {
    const target = deleting;
    setDeleting(null);
    if (target.lib) await clearSeriesListInfo(target.seriesId, target.manualId);
    else await removeListEntry(target.manualId);
    await reload();
  }

  // "Continua" è il tocco che serve a chiedere il permesso di lettura sul file:
  // la richiesta parte da qui, durante il gesto (vedi useChapterOpener).
  async function confirmResume() {
    const { target } = resume;
    setResume(null);
    await openChapter(target);
  }

  // Un titolo appena aggiunto si va a vedere nel suo filtro; una modifica lascia
  // il filtro com'è (la serie potrebbe non essere nel filtro dello stato scelto:
  // lo stato della lettura vince su quello scelto a mano).
  function handleSaved(state) {
    const wasNew = dialog.entry == null;
    setDialog(null);
    if (wasNew) chooseFilter(state);
    reload();
  }

  function resumeNote() {
    const { item, target } = resume;
    const parts = [
      item.title,
      target.volumeNumber != null ? t('continue.volume', { number: target.volumeNumber }) : null,
      chapterLabel(target, t),
      target.lastPageRead != null && target.totalPages
        ? t('myList.resume.page', { page: target.lastPageRead + 1, total: target.totalPages })
        : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }

  const normalizedQuery = query.trim().toLowerCase();
  const rows = items
    ? sortItems(
        items.filter(
          (item) => matchesFilter(item, filter) && (!normalizedQuery || item.title.toLowerCase().includes(normalizedQuery)),
        ),
        sort,
      )
    : [];

  return (
    <div className="page my-list">
      <Link to="/profilo" className="my-list-back">
        <Icon name="back" size={16} />
        {t('profile.title')}
      </Link>

      <div className="my-list-head">
        <div className="page-heading">
          <span className="page-eyebrow" aria-hidden="true">
            人
          </span>
          <h1>
            {t('myList.title')}
            {items && <span className="my-list-count">{t('myList.count', { count: rows.length })}</span>}
          </h1>
        </div>
        <div className="my-list-actions">
          <button
            type="button"
            className="my-list-edit"
            aria-label={t('myList.addAria')}
            title={t('myList.addAria')}
            onClick={() => setDialog({ entry: null })}
          >
            <Icon name="plus" size={20} />
          </button>
          <button
            type="button"
            className="my-list-edit"
            aria-pressed={editing}
            aria-label={t('myList.editAria')}
            title={t('myList.editAria')}
            onClick={() => {
              setEditing((current) => !current);
              setWarning(null);
            }}
          >
            <Icon name={editing ? 'check' : 'edit'} size={18} />
          </button>
        </div>
      </div>

      {items === null ? (
        <SkeletonList rows={4} label={t('library.loading')} />
      ) : (
        <>
          <ListChips items={items} value={filter} onChange={chooseFilter} />

          <div className="my-list-toolbar">
            <label className="my-list-search">
              <Icon name="search" size={16} />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('myList.searchPlaceholder')}
                aria-label={t('myList.searchPlaceholder')}
              />
            </label>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label={t('myList.sortAria')}>
              {LIST_SORTS.map((option) => (
                <option key={option} value={option}>
                  {t(`myList.sort.${option}`)}
                </option>
              ))}
            </select>
          </div>

          <p className="my-list-hint">{t(`myList.hint.${filter}`)}</p>
          {editing && <p className="my-list-edit-banner">{t('myList.editBanner')}</p>}
          {warning && <WarningNotice>{warning}</WarningNotice>}
          {notice && <WarningNotice>{notice}</WarningNotice>}

          {rows.length === 0 ? (
            <p className="my-list-empty">
              <Icon name="inbox" size={22} />
              <span>{normalizedQuery ? t('myList.noResults') : t(`myList.empty.${filter}`)}</span>
            </p>
          ) : (
            <div className="my-list-grid">
              {rows.map((item) => (
                <MyListTile
                  key={item.key}
                  item={item}
                  editing={editing}
                  onOpen={openItem}
                  onStar={toggleStar}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </>
      )}

      {dialog && (
        <ListEntryDialog
          entry={dialog.entry}
          defaultState={filter === 'done' ? 'done' : 'toread'}
          onClose={() => setDialog(null)}
          onSaved={handleSaved}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t(deleting.lib ? 'myList.clear.title' : 'myList.delete.title')}
          note={t(deleting.lib ? 'myList.clear.note' : 'myList.delete.note', { title: deleting.title })}
          confirmLabel={t(deleting.lib ? 'myList.clear.confirm' : 'myList.delete.confirm')}
          cancelLabel={t('myList.entry.cancel')}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {resume && (
        <ConfirmDialog
          title={t('myList.resume.title')}
          note={resumeNote()}
          confirmLabel={t('myList.resume.confirm')}
          cancelLabel={t('myList.entry.cancel')}
          onConfirm={confirmResume}
          onCancel={() => setResume(null)}
        />
      )}
    </div>
  );
}

export default MyList;
