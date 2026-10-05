import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from './Icon.jsx';
import { PROFILE_SECTIONS } from '../profileSections.js';
import './ProfileMenu.css';

// Chiave inglese in cima al Profilo (Fase 35): apre una tendina con Aspetto,
// Lingua e Backup e ripristino. Si chiude toccando fuori, con Escape o
// scegliendo una voce — come il menu "+" dell'importazione.
function ProfileMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="profile-menu" ref={rootRef}>
      <button
        type="button"
        className="profile-menu-button"
        aria-label={t('profile.settings')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="wrench" size={20} />
      </button>

      {open && (
        <ul className="profile-menu-list" role="menu">
          {PROFILE_SECTIONS.map((section) => (
            <li key={section.id} role="none">
              <Link to={`/profilo/${section.id}`} role="menuitem" onClick={() => setOpen(false)}>
                <Icon name={section.icon} size={18} />
                <span>{t(section.labelKey)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProfileMenu;
