# Blob

<img src="desktop/icon.png" width="96" align="right" alt="Blob" />

Voice, chat, soundboard and high-quality screen sharing on a server you run yourself, for you and your friends.

- Text and voice channels, multiple servers, invites
- Screen sharing with any resolution, FPS, bitrate and codec, plus PC audio (without the call's voices)
- AI noise suppression (DeepFilterNet3 or RNNoise), echo cancellation, noise gate
- Instant speaking indicator, soundboard, per-user and per-stream volume (up to 200%), push to talk
- Self-updating: the desktop app through GitHub Releases, the server through `git pull`

## Install the app

- **Windows:** download [Blob-Setup.exe](https://github.com/bomberm4n-lgtm/blob/releases/latest/download/Blob-Setup.exe) and run it.
- **Linux (Ubuntu and derivatives):**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/bomberm4n-lgtm/blob/main/install-linux.sh | bash
  ```

On first launch the app asks for the server address (for example `100.x.x.x:3000` over Tailscale).

## Run the server (Windows)

1. Install [Node.js](https://nodejs.org) and [Git](https://git-scm.com).
2. `git clone https://github.com/bomberm4n-lgtm/blob.git` and open the folder.
3. Right-click `Open Firewall (run as admin).bat` and choose **Run as administrator** (once).
4. Run `Start Blob Server.bat`. It installs everything, downloads LiveKit and checks GitHub for updates every 5 minutes.

Friends connect over [Tailscale](https://tailscale.com): share the server machine with them from the Tailscale admin console.
Keys and the invite code are generated in `server/config.json`, which never goes to GitHub.

## Release a new desktop version

1. Bump `version` in `desktop/package.json`.
2. `git tag vX.Y.Z && git push --tags`

GitHub Actions builds the installers and the installed apps update themselves.

## Third-party licenses

LiveKit (Apache-2.0), Electron (MIT), DeepFilterNet3 (MIT/Apache-2.0), RNNoise (BSD-3), React (MIT).
