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
        <img src="/blob.svg" alt="" className="auth-logo" />
        <h1>{mode === 'login' ? 'Que bom te ver de novo!' : 'Criar uma conta'}</h1>
        <p className="muted">{mode === 'login' ? 'Entre no Blob pra falar com a galera.' : 'Peça o código de convite pro dono do servidor.'}</p>
        <label>Nome de usuário<input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required /></label>
        <label>Senha<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {mode === 'register' && (
          <label>Código de convite do Blob<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ex: a1b2c3" /></label>
        )}
        {error && <div className="form-error">{error}</div>}
        <button className="btn primary big" disabled={busy}>{mode === 'login' ? 'Entrar' : 'Criar conta'}</button>
        <p className="muted small">
          {mode === 'login' ? 'Precisa de uma conta? ' : 'Já tem conta? '}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Registre-se' : 'Entrar'}
          </a>
        </p>
      </form>
    </div>
  );
}
