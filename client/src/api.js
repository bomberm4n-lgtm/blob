// Chamadas HTTP e WebSocket para o servidor Blob.
export const getToken = () => localStorage.getItem('blob_token');
export const setToken = (t) => (t ? localStorage.setItem('blob_token', t) : localStorage.removeItem('blob_token'));

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(path, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      location.reload();
    }
    throw new Error(data.error || 'Erro ' + res.status);
  }
  return data;
}

export function connectSocket(onMessage, onStatus) {
  let ws;
  let closed = false;
  let retry = 0;
  const open = () => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${getToken()}`);
    ws.onopen = () => { retry = 0; onStatus?.(true); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch { /* ignore */ } };
    ws.onclose = () => {
      onStatus?.(false);
      if (!closed) setTimeout(open, Math.min(1000 * 2 ** retry++, 10000));
    };
  };
  open();
  return {
    send: (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m)),
    close: () => { closed = true; ws?.close(); },
  };
}
