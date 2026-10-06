import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import './ToastContext.css';

// Avvisi brevi e non bloccanti (Fase 37), per esempio "aggiunta ai preferiti":
// compaiono in basso, spariscono da soli e possono avere un'azione ("Annulla").
// Stesso schema degli altri Context dell'app: un Provider in cima all'albero e
// un hook per chiedere un avviso da qualunque punto, senza passare props.
const ToastContext = createContext(null);

// Quanto resta visibile: un po' di più se c'è un'azione da poter toccare.
const DURATION_MS = 3500;
const DURATION_WITH_ACTION_MS = 6000;

export function ToastProvider({ children }) {
  // { id, message, actionLabel, onAction } oppure null. Un avviso nuovo sostituisce
  // quello visibile: in coda non ce n'è mai più di uno.
  const [toast, setToast] = useState(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => setToast(null), []);

  const showToast = useCallback(({ message, actionLabel = null, onAction = null }) => {
    nextId.current += 1;
    setToast({ id: nextId.current, message, actionLabel, onAction });
  }, []);

  // Il timer riparte a ogni avviso nuovo (cambia l'id) e si ferma se l'avviso
  // sparisce prima, o se il componente smonta.
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(dismiss, toast.actionLabel ? DURATION_WITH_ACTION_MS : DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  function handleAction() {
    const action = toast.onAction;
    dismiss();
    action?.();
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span className="toast-message">{toast.message}</span>
            {toast.actionLabel && (
              <button type="button" className="toast-action" onClick={handleAction}>
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

// L'hook sta con il Context che consuma (come negli altri Context del progetto).
// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast deve essere usato dentro un ToastProvider');
  return context;
}
