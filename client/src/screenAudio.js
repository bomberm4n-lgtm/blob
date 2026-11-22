// Screen-share audio may only be published when it can't contain the call's own voices (echo for viewers).
// A plain system loopback (Linux, desktop app 0.1.x, browsers sharing a screen) records everything Blob plays.
export function screenAudioExcludesBlob(audioSettings = {}, videoSettings = {}) {
  if (audioSettings.deviceId === 'loopbackWithoutChrome') return true; // Windows desktop app 0.2+
  return videoSettings.displaySurface === 'browser'; // a browser tab only carries that tab's audio
}
