import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getToken } from './api';
import App from './App';
import Auth from './Auth';
import Intro from './Intro';
import { applyAccent, slimeLogo } from './theme';

// Same color as the intro slime, for the whole app.
applyAccent();
document.querySelector('link[rel="icon"]')?.setAttribute('href', slimeLogo);
import './styles.css';
import './profile.css';

function Root() {
  const [authed, setAuthed] = useState(!!getToken());
  // Intro plays once per app launch (not on the automatic reloads after an update).
  const [intro, setIntro] = useState(() => !sessionStorage.getItem('blob_intro_seen'));
  const endIntro = () => { sessionStorage.setItem('blob_intro_seen', '1'); setIntro(false); };
  return (
    <>
      {authed ? <App /> : <Auth onDone={() => setAuthed(true)} />}
      {intro && <Intro onDone={endIntro} />}
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
