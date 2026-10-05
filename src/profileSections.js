// Le pagine delle impostazioni dentro la scheda Profilo (Fase 35): ognuna ha un
// indirizzo (/profilo/<id>), un'icona nel menu della chiave inglese e il testo
// del titolo. Un file a sé perché lo usano il menu e la pagina, e ESLint
// (react-refresh) non vuole costanti esportate accanto a un componente.
export const PROFILE_SECTIONS = [
  { id: 'aspetto', icon: 'settings', labelKey: 'profile.menu.aspetto' },
  { id: 'lingua', icon: 'globe', labelKey: 'profile.menu.lingua' },
  { id: 'backup', icon: 'save', labelKey: 'profile.menu.backup' },
];
