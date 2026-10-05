import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { useUiPreferences } from '../UiPreferencesContext.jsx';
import './AppNav.css';

const NAV_LINKS = [
  { to: '/', key: 'nav.library', icon: 'library', jp: '蔵書', end: true },
  { to: '/reader', key: 'nav.reader', icon: 'reader', jp: '頁' },
  { to: '/profilo', key: 'nav.profile', icon: 'user', jp: '人' },
];

// Navigazione tra le tre sezioni, nel modo scelto in Impostazioni → Aspetto
// (ADR-002): tre icone sempre visibili (predefinito), oppure un burger che
// apre un menu a tendina o un pannello laterale. Le tre forme mostrano le
// stesse destinazioni; cambia solo quanto costano in tocchi e in spazio.
function AppNav() {
  const { t } = useTranslation();
  const { prefs } = useUiPreferences();
  const [open, setOpen] = useState(false);

  // Escape chiude il menu aperto: un gesto atteso da tastiera.
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  if (prefs.menu === 'icons') {
    return (
      <nav className="app-nav" aria-label={t('nav.sections')}>
        {NAV_LINKS.map(({ to, key, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `app-nav-icon${isActive ? ' active' : ''}`}
            aria-label={t(key)}
            title={t(key)}
          >
            <Icon name={icon} size={20} />
          </NavLink>
        ))}
      </nav>
    );
  }

  const closeMenu = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="app-burger"
        aria-label={t(open ? 'nav.close' : 'nav.menu')}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name={open ? 'close' : 'menu'} size={20} />
      </button>

      {open && <div className={`app-scrim app-scrim--${prefs.menu}`} onClick={closeMenu} />}

      {open && (
        <nav className={`app-menu app-menu--${prefs.menu}`} aria-label={t('nav.sections')}>
          {prefs.menu === 'drawer' && (
            <div className="app-menu-head">
              <span>{t('nav.drawerTitle')}</span>
              <button type="button" className="app-menu-close" aria-label={t('nav.close')} onClick={closeMenu}>
                <Icon name="close" size={18} />
              </button>
            </div>
          )}
          {NAV_LINKS.map(({ to, key, icon, jp, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `app-menu-item${isActive ? ' active' : ''}`}
              onClick={closeMenu}
            >
              <Icon name={icon} />
              <span>{t(key)}</span>
              <span className="app-menu-jp" aria-hidden="true">
                {jp}
              </span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

export default AppNav;
