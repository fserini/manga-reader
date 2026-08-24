import { Routes, Route, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Library from './pages/Library.jsx';
import Reader from './pages/Reader.jsx';
import Settings from './pages/Settings.jsx';
import UpdatePrompt from './components/UpdatePrompt.jsx';
import { useAppChrome } from './AppChromeContext.jsx';
import './App.css';

const NAV_LINKS = [
  { to: '/', key: 'nav.library', end: true },
  { to: '/reader', key: 'nav.reader' },
  { to: '/settings', key: 'nav.settings' },
];

function App() {
  const { t } = useTranslation();
  const { chromeHidden } = useAppChrome();

  return (
    <div className="app">
      {!chromeHidden && (
        <nav className="app-nav">
          {NAV_LINKS.map(({ to, key, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t(key)}
            </NavLink>
          ))}
        </nav>
      )}

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Library />} />
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
