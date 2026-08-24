import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import it from './locales/it.json';
import en from './locales/en.json';

// languageDetector si occupa da solo di due cose che altrove nel progetto
// scriviamo a mano quando serve una preferenza persistente: leggere la
// preferenza salvata (qui da localStorage, chiave "i18nextLng") e, in sua
// assenza, dedurne una ragionevole dal browser (navigator.language) — con
// ordine e chiave configurabili in "detection" qui sotto.
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      it: { translation: it },
      en: { translation: en },
    },
    fallbackLng: 'it',
    supportedLngs: ['it', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false, // React già previene l'XSS nel proprio output: la doppia escape sarebbe ridondante
    },
  });

export default i18n;
