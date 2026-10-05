import { useTranslation } from 'react-i18next';
import ProfileMenu from '../components/ProfileMenu.jsx';
import StatsCard from '../components/StatsCard.jsx';
import MySeriesCard from '../components/MySeriesCard.jsx';
import './Profile.css';

// La terza scheda (Fase 35, ADR-002): prima si chiamava "Impostazioni" ed era
// una pagina lunga di impostazioni più, in fondo, le statistiche. Ora è il
// Profilo: in alto una chiave inglese che apre le impostazioni (Aspetto, Lingua,
// Backup e ripristino, ognuna in una sua pagina), e nella pagina le card: le
// Statistiche e, dalla Fase 34, la lista "Le mie serie".
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
      <MySeriesCard />
    </div>
  );
}

export default Profile;
