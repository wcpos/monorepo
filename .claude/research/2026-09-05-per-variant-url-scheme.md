# Per-variant URL scheme: stop the login redirect landing in the wrong app

Date: 2026-09-05. Trigger: with `com.wcpos.main` and `com.wcpos.main.dev` installed on one
device, the login redirect (`wcpos://…#access_token=…`) does not know which app to return to.
Raised alongside PR #1853 (a new dev-client build is happening anyway).

## Why it happens (verified)

- `apps/main/app.config.ts` sets `scheme: 'wcpos'` for ALL three profiles (production,
  `development` → `com.wcpos.main.dev`, `adhoc` → `com.wcpos.main.adhoc`). Bundle ids differ,
  the URL scheme does not.
- `packages/core/src/hooks/use-wcpos-auth/utils.ts` hardcodes
  `makeRedirectUri({ scheme: 'wcpos' })`, so every variant asks the server to redirect to
  `wcpos://` and every installed variant claims that scheme.
- Platform behaviour for duplicate custom schemes:
  - **Android**: expected behaviour, not a bug. The OS opens the user's default handler if one
    was chosen, else the only handler, else a disambiguation dialog. It never guarantees the
    originating app ([Android: Create deep links](https://developer.android.com/training/app-links/create-deeplinks)).
  - **iOS**: Apple documents that if multiple apps register the same scheme, which one opens is
    **undefined**. No chooser, no order rule ([Apple: Defining a custom URL scheme](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app),
    [OWASP MASTG-KNOW-0079](https://mas.owasp.org/MASTG/knowledge/ios/MASVS-PLATFORM/MASTG-KNOW-0079/)).

## The solved pattern

Give each build variant its own scheme, exactly as each has its own bundle id. Expo's
multi-variant guide only varies `name`/`bundleIdentifier`/`package`
([docs](https://docs.expo.dev/tutorial/eas/multiple-app-variants/)) and is silent on `scheme`,
but the Android/Gradle world does this routinely (per-flavor scheme via manifest placeholders,
e.g. Adjust's docs) and OAuth-for-native guidance is to register one redirect per variant with
the IdP ([OAuth 2.0 Simplified](https://www.oauth.com/oauth2-servers/oauth-native-apps/redirect-urls-for-native-apps/)).

What the installed tooling already does (read from `node_modules`, Expo SDK in this repo):

- `@expo/config-plugins` accepts `scheme` as a string **or array**; iOS prebuild also appends
  `ios.bundleIdentifier` as a `CFBundleURLScheme` (so `com.wcpos.main.dev://` already exists on
  iOS dev builds; Android has no equivalent).
- `expo-dev-client`'s plugin registers `exp+<slug>` = `exp+wcpos` on **dev-client builds only**.
  So `exp+wcpos://` is already unique to the dev client on both platforms today, but the
  plugin's allow-list rejects it (see below), and adhoc vs production would still collide.
- `expo-linking`'s `resolveScheme` (used by `makeRedirectUri`): with no `scheme` option it takes
  the **first** manifest scheme and warns if there are extras; with an explicit `scheme` it warns
  in `__DEV__` if that scheme is not in the manifest.
- `expo-dev-launcher` matches its deep link by **host** only (`expo-development-client`), any
  scheme the app owns works: `wcpos-dev://expo-development-client/?url=…` is fine.

## Server side (woocommerce-pos plugin)

`includes/Templates/Auth.php` has `ALLOWED_SCHEMES = ['wcpos', 'exp', 'https', 'http']` and
matches with `stripos($uri, $scheme . '://')`, so `wcpos-dev://` and `exp+wcpos://` are BOTH
rejected today ("Missing or invalid redirect_uri parameter"). Any new app scheme needs a plugin
change first. Shipped plugin is 1.10.7; dev stores deploy from the plugin repo's trunk.

## Recommended change set

1. **`apps/main/app.config.ts`**: `scheme: isDev ? 'wcpos-dev' : isAdhoc ? 'wcpos-adhoc' : 'wcpos'`.
   Production is untouched (no plugin dependency for real users). Native fingerprint moves for
   dev/adhoc, which is fine because #1853 forces a dev-client build anyway. Land before that
   build, otherwise it costs a second one.
2. **`packages/core/src/hooks/use-wcpos-auth/utils.ts`**: drop the hardcoded
   `scheme: 'wcpos'` so `makeRedirectUri` reads the manifest scheme. Update `utils.test.ts`
   accordingly. Web/Electron implementations are unaffected (Electron owns `wcpos://` on desktop
   via `setAsDefaultProtocolClient`; leave it).
3. **Plugin `Auth.php`**: allow `wcpos-dev` and `wcpos-adhoc` (an explicit list is preferable to
   a prefix regex so the allow-list stays an allow-list). Release order: plugin patch → adhoc
   builds, since adhoc testers hit arbitrary stores. Dev stores pick it up on the next deploy.
4. **Maestro**: three `openLink: 'wcpos://expo-development-client/…'` sites
   (`subflows/relaunch-app.yml` ×2, `flows/01-clean-launch-connect.yml`,
   `flows/02-auth-setup.yml`) become `wcpos-dev://…`; the comment at flow 02 line 333 and the
   `adb reverse` workaround in #1853's description also mention the scheme. The iOS
   "Open in WCPOS?" scheme confirmation is unchanged in shape.
5. Nothing else in `packages/` or `apps/main/src` keys on the literal `wcpos://` (grepped).

## Not recommended

- **App Links / Universal Links (https)** solve the chooser for content links, but the redirect
  chain then depends on domain verification staying healthy, both variants would claim the same
  domain (still ambiguous on iOS), and verified links cannot carry the fragment-based token
  return the plugin uses today. Wrong tool for the OAuth return.
- **Using the incidental `exp+wcpos` / `com.wcpos.main.dev` schemes** to avoid a build: works
  only for dev-vs-prod, not adhoc, and reads as a trick. A build is happening anyway.
