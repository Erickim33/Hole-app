# Hole — React Native App

This is the real thing: a React Native app (via Expo) that connects to
your `hole-backend` server over REST + Socket.IO. Same features as the
`hole-live.html` version, but it's an actual installable app instead of
a page in a browser.

## Fastest way to see it as a real app on your phone (no App Store, ~2 min)

You need [Node.js](https://nodejs.org) installed on your computer.

```bash
cd hole-app
npm install
npx expo start
```

This prints a QR code in your terminal.

1. Install **Expo Go** from the App Store / Play Store on your phone
2. Scan the QR code (Camera app on iOS, Expo Go's scanner on Android)
3. Hole opens as a real app on your phone — full-screen, native
   components, no browser chrome. Every edit you make to `App.js` shows
   up instantly (hot reload).

This is genuinely how the app runs day to day during development —
Expo Go isn't a "demo mode," it's the standard React Native dev loop.

## Using it

1. On first launch, enter your deployed backend URL (from
   `hole-backend` — see its README for Railway deployment) and your
   phone number
2. Code is mocked as `123456`
3. New number → set username/display name/emoji. Existing number →
   logs you straight in
4. Search for another registered username to start chatting
5. Session persists (AsyncStorage) — closing and reopening the app
   keeps you logged in

## Getting a real installable build (icon on your home screen, no Expo Go)

This uses Expo's free cloud build service — still no Xcode/Android
Studio required on your end.

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios      # or: --platform android
```

- **Android**: this produces a real `.apk`/`.aab` you can install
  directly or upload to the Play Store
- **iOS**: produces a real `.ipa`. To install it on your own phone
  without the App Store, use `eas build --profile development` +
  TestFlight, or `expo install expo-dev-client` for a dev build. Full
  App Store release needs an Apple Developer account ($99/yr) —
  standard for any iOS app, not specific to this one

## What's different from the web prototype

- Real navigation via native components (no browser DOM)
- Session persists across app restarts (`AsyncStorage`) — the web
  version forgets everything on refresh
- Feels and behaves like a normal iOS/Android app: native keyboard
  handling, native scroll, no browser UI

## What's still not done

Same gaps as the backend: no E2EE yet (messages are plaintext over a
TLS connection to your server), no real push notifications when the
app is backgrounded (would need `expo-notifications` + APNs/FCM
credentials wired into the backend's `Device` model, which already
exists but isn't used yet), no calling (needs WebRTC signaling on top
of this socket layer). Happy to build any of those next.
