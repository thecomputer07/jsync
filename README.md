# JSync — Sync your films

A Jellyfin player for iPhone, iPad, Android and Android TV. Watch movies and shows alone or with friends, perfectly in sync, using your own Jellyfin server's SyncPlay groups.

No JSync account, no servers of ours, no tracking. [Privacy policy](https://thecomputer07.github.io/jsync/privacy/)

## Features

- Netflix-like home, continue watching, next up, my list, library filters
- Watch parties (SyncPlay) with invite links and QR codes
- Skip intro/recap, next episode, scrub previews, gestures, speed, quality
- AirPlay, Chromecast, picture in picture
- English and Italian

Requires Jellyfin 10.9 or later.

## Development

```bash
npm install
npx expo start
```

## Builds

GitHub Actions (`.github/workflows`) build iOS and Android for free with `eas build --local`. Needs the `EXPO_TOKEN` secret and EAS credentials (`npx eas-cli credentials`).

## License

MIT
