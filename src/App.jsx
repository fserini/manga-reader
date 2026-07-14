import { Routes, Route, NavLink } from 'react-router-dom';
import Library from './pages/Library.jsx';
import Reader from './pages/Reader.jsx';
import Settings from './pages/Settings.jsx';
import './App.css';

const NAV_LINKS = [
  { to: '/', label: 'Libreria', end: true },
  { to: '/reader', label: 'Lettore' },
  { to: '/settings', label: 'Impostazioni' },
];

function App() {
  return (
    <div className="app">
      <nav className="app-nav">
        {NAV_LINKS.map(({ to, label, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/reader/:chapterId" element={<Reader />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
