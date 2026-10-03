import { useEffect, useMemo } from 'react';

// URL oggetto per un Blob (una miniatura), creato e revocato col ciclo di
// vita del componente: senza revoca, ogni miniatura mostrata resterebbe in
// memoria finché la scheda non viene chiusa.
export function useObjectUrl(blob) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    if (!url) return undefined;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
