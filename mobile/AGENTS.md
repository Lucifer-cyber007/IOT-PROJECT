# Expo HAS CHANGED

This project is pinned to **Expo SDK 54**, not the latest SDK.

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Why SDK 54 and not the latest

Expo Go (the Play Store / App Store client) only opens projects built on the SDK it ships with,
which is currently **54**. A newer SDK makes Expo Go reject the QR code as invalid. Check the
ceiling before bumping:

    curl -s https://api.expo.dev/v2/versions/latest | grep -o '"expoGoSdkVersion":"[^"]*"'

Only raise the SDK past that number if you are also moving off Expo Go to a development build.
