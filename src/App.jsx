import { Routes, Route, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Library from './pages/Library.jsx';
import Uncategorized from './pages/Uncategorized.jsx';
import Reader from './pages/Reader.jsx';
import Settings from './pages/Settings.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import Brand from './components/Brand.jsx';
import AppNav from './components/AppNav.jsx';
import { useAppChrome } from './AppChromeContext.jsx';
import { useUiPreferences } from './UiPreferencesContext.jsx';
import './App.css';

function App() {
  const { t } = useTranslation();
  const { chromeHidden } = useAppChrome();
  const { prefs } = useUiPreferences();

  return (
    <div className="app">
      {!chromeHidden && (
        <header className="app-bar">
          <Link to="/" className="app-brand" aria-label={t('nav.home')}>
            <Brand variant={prefs.logo} />
          </Link>
          <AppNav />
        </header>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/uncategorized" element={<Uncategorized />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/reader/:chapterId" element={<Reader />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <UpdatePrompt />
    </div>
  );
}

export default App;
