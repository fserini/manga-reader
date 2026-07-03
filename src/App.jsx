import { Routes, Route, NavLink } from 'react-router-dom';
import Library from './pages/Library.jsx';
import Reader from './pages/Reader.jsx';
import Settings from './pages/Settings.jsx';
import './App.css';

function App() {
  return (
    <div>
      <nav>
        <NavLink to="/">Libreria</NavLink>
        {' | '}
        <NavLink to="/reader">Lettore</NavLink>
        {' | '}
        <NavLink to="/settings">Impostazioni</NavLink>
      </nav>

      <main>
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/reader" element={<Reader />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;