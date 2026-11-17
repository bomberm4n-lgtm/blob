import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getToken } from './api';
import App from './App';
import Auth from './Auth';
import './styles.css';

function Root() {
  const [authed, setAuthed] = useState(!!getToken());
  return authed ? <App /> : <Auth onDone={() => setAuthed(true)} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
