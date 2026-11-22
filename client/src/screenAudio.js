// Screen-share audio may only be published when it can't contain the call's own voices (echo for viewers).
// A plain system loopback (Linux, desktop app 0.1.x, browsers sharing a screen) records everything Blob plays.
export function screenAudioExcludesBlob(audioSettings = {}, videoSettings = {}) {
  if (audioSettings.deviceId === 'loopbackWithoutChrome') return true; // Windows desktop app 0.2+
  return videoSettings.displaySurface === 'browser'; // a browser tab only carries that tab's audio
}

// Says what was detected, so the person streaming knows exactly what to fix.
export function noPcAudioReason({ ua = '', desktop = false, deviceId = '' } = {}) {
  const start = 'Streaming without PC audio (it would echo the call). ';
  if (!desktop) return start + 'Detected: WEB BROWSER. Open the installed Blob app to stream PC audio.';
  const version = /blob[/]([0-9]+[.][0-9]+[.][0-9]+)/i.exec(ua)?.[1] || 'unknown version';
  if (/Linux/.test(ua)) return start + 'Detected: Blob ' + version + ' on Linux, where PC audio is not supported yet.';
  if (version.startsWith('0.1.')) return start + 'Detected: OLD Blob ' + version + '. Close it (delete Blob-Portatil if you use it) and open Blob 0.2 or newer.';
  return start + 'Detected: Blob ' + version + ', capture "' + deviceId + '". Send this message to the server owner.';
}
