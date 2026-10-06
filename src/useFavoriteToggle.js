import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toggleSeriesFavorite } from './db.js';
import { useToast } from './ToastContext.jsx';

// Mette o toglie la stella a una serie e lo dice con un avviso breve (Fase 37).
// Alla rimozione l'avviso offre "Annulla", che rimette la stella. `onChanged` è
// la funzione con cui la schermata si ricarica: va chiamata dopo ogni cambio,
// anche quello fatto da "Annulla" (che arriva a schermata già cambiata, per cui
// chi la passa deve darne una sempre aggiornata).
export function useFavoriteToggle() {
  const { t } = useTranslation();
  const { showToast } = useToast();

  return useCallback(
    async (seriesId, title, onChanged) => {
      const favorite = await toggleSeriesFavorite(seriesId);
      if (favorite === undefined) return; // la serie non c'è più
      await onChanged?.();
      showToast({
        message: t(favorite ? 'favorites.added' : 'favorites.removed', { title }),
        actionLabel: favorite ? null : t('favorites.undo'),
        onAction: favorite
          ? null
          : async () => {
              await toggleSeriesFavorite(seriesId);
              await onChanged?.();
            },
      });
    },
    [showToast, t],
  );
}
