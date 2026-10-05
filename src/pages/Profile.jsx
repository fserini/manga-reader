import { useTranslation } from 'react-i18next';
import ProfileMenu from '../components/ProfileMenu.jsx';
import StatsCard from '../components/StatsCard.jsx';
import './Profile.css';

// La terza scheda (Fase 35, ADR-002): prima si chiamava "Impostazioni" ed era
// una pagina lunga di impostazioni più, in fondo, le statistiche. Ora è il
// Profilo: in alto una chiave inglese che apre le impostazioni (Aspetto, Lingua,
// Backup e ripristino, ognuna in una sua pagina), e nella pagina le card. Per
// ora c'è solo la card Statistiche; la lista "Le mie serie" (Fase 34) si
// aggiunge qui sotto.
function Profile() {
  const { t } = useTranslation();

  return (
    <div className="page profile">
      <div className="profile-header">
        <div className="page-heading">
          <span className="page-eyebrow" aria-hidden="true">
            人
          </span>
          <h1>{t('profile.title')}</h1>
        </div>
        <ProfileMenu />
      </div>

      <StatsCard />
    </div>
  );
}

export default Profile;
