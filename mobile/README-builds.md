# TSKR test builds

Run these in `mobile/` on the Mac. `TSKR_UPDATES=1` turns on over-the-air updates; `EAS_NO_VCS=1` is needed
while the Mac has no Git (Apple command line tools).

| What | Command |
|---|---|
| Test on iPhone with Expo Go | `npx expo start -c` (add `--tunnel` if on another Wi-Fi) |
| Send changes to installed test apps | `TSKR_UPDATES=1 EAS_NO_VCS=1 npx eas-cli@latest update --branch preview --message "what changed"` |
| New Android APK | `TSKR_UPDATES=1 EAS_NO_VCS=1 npx eas-cli@latest build -p android --profile preview` |

Installed test apps pick up an update after being closed and opened twice.
