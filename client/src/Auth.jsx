import { slimeLogo } from './theme';
import { useState } from 'react';
import { api, setToken } from './api';

export default function Auth({ onDone }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { token } = await api(mode === 'login' ? '/api/login' : '/api/register', { method: 'POST', body: { username, password, code } });
      setToken(token);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-blobs"><span /><span /><span /></div>
      <form className="auth-card" onSubmit={submit}>
        <img src={slimeLogo} alt="" className="auth-logo" />
        <h1>{mode === 'login' ? 'Welcome back!' : 'Create an account'}</h1>
        <p className="muted">{mode === 'login' ? 'Log in to Blob to hang out with the crew.' : 'Ask the server owner for the invite code.'}</p>
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {mode === 'register' && (
          <label>Blob invite code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. a1b2c3" /></label>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
        <p className="muted small">
          {mode === 'login' ? 'Need an account? ' : 'Already have an account? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Register' : 'Log in'}
          </a>
        </p>
      </form>
    </div>
  );
}
