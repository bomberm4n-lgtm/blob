# Blob

Voz, chat, soundboard e transmissão de tela em alta qualidade, para usar com os amigos num servidor próprio.

- Canais de texto e voz, vários servidores, convites
- Transmissão de tela com resolução, FPS, bitrate e codec livres, com o áudio do PC (sem as vozes da call)
- Supressão de ruído com IA (DeepFilterNet3 ou RNNoise), cancelamento de eco, noise gate
- Soundboard, volume por pessoa e por transmissão (até 200%), aperte-para-falar
- Atualiza sozinho: o app desktop pelo GitHub Releases, o servidor pelo `git pull`

## Instalar o app

- **Windows:** baixe [Blob-Setup.exe](https://github.com/bomberm4n-lgtm/blob/releases/latest/download/Blob-Setup.exe) e instale.
- **Linux (Ubuntu e derivados):**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/bomberm4n-lgtm/blob/main/install-linux.sh | bash
  ```

Na primeira vez, o app pede o endereço do servidor (ex.: `100.x.x.x:3000` pela Tailscale).

## Rodar o servidor (Windows)

1. Instale [Node.js](https://nodejs.org) e [Git](https://git-scm.com).
2. `git clone https://github.com/bomberm4n-lgtm/blob.git` e abra a pasta.
3. Clique com o botão direito em `Liberar Firewall (executar como admin).bat` e escolha **Executar como administrador** (uma vez só).
4. Abra `Iniciar Servidor Blob.bat`. Ele instala tudo, baixa o LiveKit e, a cada 5 minutos, confere se há atualização no GitHub.

As chaves e o código de convite são gerados em `server/config.json`, que nunca vai pro GitHub.

## Lançar uma versão nova do app desktop

1. Aumente `version` em `desktop/package.json`.
2. `git tag vX.Y.Z && git push --tags`

O GitHub Actions gera os instaladores, e os apps instalados se atualizam sozinhos.

## Licenças de terceiros

LiveKit (Apache-2.0), Electron (MIT), DeepFilterNet3 (MIT/Apache-2.0), RNNoise (BSD-3), React (MIT).
