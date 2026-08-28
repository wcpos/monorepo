# Card-present SDK landscape for the app driver harness

Research for [roadmap#114](https://github.com/wcpos/roadmap/issues/114). Date: 2026-08-28.
Question: which payment providers offer a card-present / in-person SDK usable from React Native + Expo,
and what does each cost to host in ONE public app with the driver **disabled by default**?
Primary sources only (vendor docs, official SDK repos, npm registry, Apple/Google). Facts only — no recommendations.

Stripe Terminal is summarised in one row; the full study is [roadmap#99](https://github.com/wcpos/roadmap/issues/99)
→ `.claude/research/2026-08-28-stripe-terminal-rn.md`.

## 1. Matrix

| Provider | SDK form (card-present) | Official RN wrapper | Readers | Tap to Pay | Expo | Native footprint | Approval gate | Runtime-gateable? |
|---|---|---|---|---|---|---|---|---|
| **Stripe Terminal** | Native iOS/Android + **official RN SDK** | `@stripe/stripe-terminal-react-native` **0.0.1-beta.32** (2026-07-30), public preview | BBPOS WisePad 3, WisePOS E, S700/S710, simulated | **iPhone + Android**, in-SDK | Config plugin ships with pkg; **prebuild required**, Expo Go impossible | iOS 15.1+, Android API 26+, compileSdk 35 | Apple TTP entitlement (dev + separate distribution) | Yes — link-time present, init on demand |
| **Square** | **Mobile Payments SDK** (iOS/Android) + **official RN plugin** | `mobile-payments-sdk-react-native` **2026.8.1** (2026-08-24), actively released | Reader for contactless+chip (1st/2nd gen), Reader for magstripe, Stand (1st/2nd gen). Terminal/Register = separate cloud **Terminal API** | **iPhone + Android**, in-SDK | No first-party Expo config plugin found; prebuild required | iOS 16+/Xcode 15.1+, `use_frameworks!` + mandatory build-phase script + **User Script Sandboxing = No**; Android minSdk 28, compileSdk 35 (RN plugin needs **36** + AGP 8.9.1), merges `ACCESS_FINE_LOCATION` `RECORD_AUDIO` `BLUETOOTH_CONNECT` `BLUETOOTH_SCAN` `READ_PHONE_STATE` | **Application signature** (bundle/package id + team id / SHA-256) filed in Developer Console before production; one signature covers many sellers | Yes — `initialize()` then `authorize()`, both app-invoked |
| **SumUp** | Native iOS SDK 7.1.x + Android `com.sumup:merchant-sdk:7.1.0`; **Android Tap to Pay SDK is a separate package** | **None.** Community wrappers all stale: `react-native-sumup-interface` 1.3.2 (2023-06-21), `react-native-sumup-wrapper` 1.1.0 (2021), `react-native-sumup` 0.2.0 (2017). `sumup-react-native-alpha` 0.1.36 (2024-02-07) is a third-party repo and is online/CNP, not terminal | Solo, Solo Lite, Air, 3G, PIN+ | **iPhone** (in iOS SDK) + **Android** (separate SDK package) | No RN bridge to configure; hand-rolled native module + prebuild only | iOS 16.0+, plist `NSLocationWhenInUseUsageDescription` (**mandatory** — SumUp states location is required for security and fraud-prevention compliance) + `NSBluetoothAlwaysUsageDescription`; CocoaPods support ends 2026-10-31. Android minSdk 26, targetSdk 36, AGP 9.2.1, Kotlin 2.4.0, Java 17 | Affiliate Key bound to bundle id / package name, ordered through SumUp; certification questions → integration@sumup.com | **Android: no.** Docs require `SumUpState.init(this)` in the **Application class**. iOS: `SumUpSDK.setup(affiliateKey:)` is app-invoked |
| **PayPal Zettle** | Native `iZettle/sdk-ios` **4.70.4** (2026-08-27) and `iZettle/sdk-android` **2.52.1** (2026-08-24) — both active | **None.** Community `react-native-verzettled` is WIP, iOS-only, Expo unsupported | PayPal Reader / Zettle Reader (+ QRC, Manual Card Entry) | **Not in the SDK.** Tap to Pay on iPhone exists only inside PayPal's own Zettle/Point-of-Sale app | No config plugin; prebuild required | iOS 12+, Xcode 14.1+, `ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES=YES`, **External Accessory background mode** + `UISupportedExternalAccessoryProtocols` = `com.izettle.cardreader-one`, Bluetooth + location plist keys, `CFBundleURLTypes` OAuth scheme. Android API 21+, `OAuthActivity` in manifest, `ACCESS_FINE_LOCATION` + working device location provider | Developer Portal account + Client ID; **Android artifacts live on GitHub Packages and need a PAT with `read:packages` at build time** | Configure/`start()` documented in `Application.onCreate()` / `didFinishLaunchingWithOptions` but the calls are app-owned |
| **Adyen** | Two shapes: **Terminal API** (cloud, server-to-server HTTPS — *no client library*) and **POS Mobile SDK** (`adyen-pos-mobile-ios` v3.19.1, `adyen-pos-mobile-android` v2.19.0, both 2026-08) | **None for card-present.** `@adyen/react-native` 2.12.0 wraps Drop-in/Components only (card-not-present) | Terminal API: Adyen terminal fleet (S1F2, S1E2, AMS1, V400m, …). POS Mobile SDK: NYC1 reader + Tap to Pay | **iPhone** (min iOS 18.4) **+ Android** (min Android 12, Mar-2022 patch, integrated NFC only) | No config plugin for POS Mobile SDK | Android terminal-app builds face an Adyen permission allowlist and 200 MB live APK cap (documented for Adyen-supplied terminal hardware) | Android SDK artifacts sit behind an **Adyen-issued "SDK Download API key"** on Adyen Artifactory, not Maven Central; Tap to Pay needs Apple entitlement + Adyen back-office enablement | **Best in class.** Terminal API cloud = zero native footprint. Android POS SDK repo ships `app-manual-initialization` and `app-dynamic` (**Play Feature Delivery** — SDK excluded from the base bundle) |
| **Mollie** | **No client SDK.** `POST /payments` with `method=pointofsale` + `terminalId` | n/a | Mollie Terminal (PAX A920 seen in API examples) | Tap to Pay on iPhone exists **only in Mollie's own app**, not exposed to third parties | n/a — REST | none | Terminal provisioned via dashboard / account manager | Yes, trivially — pure REST |
| **PayArc** | **Payarc Connect** cloud API driving a PAX terminal. Server SDKs only (`payarc-sdk` Node, `payarc-sdk-php`) | none found | PAX semi-integrated terminals | none found | n/a — REST | none | Merchant underwriting / boarding (ISO) | Yes, trivially — pure REST |
| **Authorize.net** | In-Person SDK for iOS (4.5.1) / Android (1.9.5), last pushed 2026-03-09 — **vendor-deprecated**: *"The iOS and Android versions of the In-Person SDK are deprecated and may not be supported in the near future. The Windows SDK is still fully supported."* Card-present itself continues via retail API fields and Authorize.net's own mPOS/VPOS apps | **None** | BBPOS Chipper 2X (hardware discontinued) | none | none | Objective-C / Java native, no RN bridge | Standard merchant underwriting | Only by avoiding the deprecated SDK and using the REST retail path |
| **Vipps MobilePay** | **No card-present SDK and no card reader.** In-store = dynamic QR, scan-customer-QR, or push-to-phone by number, over ePayment/QR/Webhooks REST | n/a | none (phone-to-phone) | n/a | n/a — REST | none (generic camera/QR only) | Merchant agreement + compliance check + a live test transaction before go-live | Yes, trivially — pure REST |

Platform layer, common to every PSP row:

| | Tap to Pay on iPhone | Tap to Pay on Android |
|---|---|---|
| API | Apple `ProximityReader` (`PaymentCardReader` introduced **iOS 15.4**) | No public Google SDK — shipped through PSP SDKs on top of Google Play services |
| Entitlement | `com.apple.developer.proximity-reader.payment.acceptance`; request form needs an **organization-level** account, logged in as **Account Holder**; Apple reviews against predefined criteria; **TestFlight/App Store need a second, distribution entitlement** re-requested by replying to the original email | Play Integrity attestation; PSP SDKs embed the Integrity key |
| PSP required | Yes — *"App developers who want to offer Tap to Pay on iPhone to merchants will first need to integrate with a supported payment service provider (PSP)"* | Yes — Google does not process transactions |
| Device | iPhone XS or later, iOS within one year of current; PIN entry needs iOS 16.4+; does not work on iPad; not on iOS betas | Android 13+ (Stripe) / Android 12+ (Adyen), GMS-certified, security patch < 12 months, unrooted + locked bootloader, unmodified OEM OS, developer options **off**, hardware keystore `FEATURE_HARDWARE_KEYSTORE` ≥ 100, integrated NFC, ARM. **Emulators unsupported, including the simulated reader** |
| Extra review item | Apple requires a "How to Tap" merchant-education overlay (`ProximityReaderDiscovery`) integrated before submission | PIN collection fails if accessibility services, screen recording, or overlay windows are active |

## 2. Per-provider notes

### Stripe Terminal (summary only — see roadmap#99)
Official RN SDK, still `0.0.1-beta.32` after years of preview ([npm](https://www.npmjs.com/package/@stripe/stripe-terminal-react-native), published 2026-07-30). Ships its own Expo config plugin but the plugin does **not** add the Apple entitlement. Android API 26+, compileSdk/targetSdk 35, iOS 15.1+; `expo prebuild` mandatory. Tap to Pay on both platforms is inside the same SDK — on Android via a separate artifact `com.stripe:stripeterminal-taptopay` alongside `stripeterminal-core` ([Stripe Tap to Pay docs](https://docs.stripe.com/terminal/payments/setup-reader/tap-to-pay?platform=android)).

### Square
- **Reader SDK is retired** (31 Dec 2025) — [migration notice](https://developer.squareup.com/docs/mobile-payments-sdk/migrate). The live product is the **Mobile Payments SDK** ([docs](https://developer.squareup.com/docs/mobile-payments-sdk)).
- Two Square RN packages exist and are easy to confuse: `react-native-square-in-app-payments` 2.1.1 (In-App Payments SDK, **card-not-present**) and `mobile-payments-sdk-react-native` 2026.8.1 (**card-present**, [repo](https://github.com/square/mobile-payments-sdk-react-native)). The card-present one is official and shipping monthly.
- Its README documents a live version conflict: Mobile Payments SDK 2.6.0 "requires Kotlin 2.2.21, which is not yet supported by React Native's Gradle plugin (0.75.x and earlier)", and needs `compileSdkVersion` 36 + AGP 8.9.1 / Gradle 8.13.
- iOS setup is intrusive: `use_frameworks!`, a build-phase run script that must execute last, and **User Script Sandboxing = No** for all configurations ([iOS docs](https://developer.squareup.com/docs/mobile-payments-sdk/ios)). Those are project-wide Xcode settings, not module-local.
- Android merges five permissions into the manifest the moment the dependency is present ([Android docs](https://developer.squareup.com/docs/mobile-payments-sdk/android)).
- Production requires filing an **application signature** in the Developer Console; Square explicitly blesses one binary serving many sellers under one Square application id.
- Runtime gating: `MobilePaymentsSdk.initialize()` + `authorizationManager.authorize(oauthToken, locationId)` are both app-invoked; nothing forces an `AppDelegate`/`Application` hook.

### SumUp
- Card-present SDKs are native only: [iOS SDK 7.1.x](https://developer.sumup.com/terminal-payments/sdks/ios-sdk) (SPM / XCFramework / CocoaPods until 2026-10-31) and [Android SDK 7.1.0](https://developer.sumup.com/terminal-payments/sdks/android-sdk) (`com.sumup:merchant-sdk`). Repo `sumup/sumup-ios-sdk` tagged v7.1.2 on 2026-07-09.
- **There is no official React Native wrapper for terminal payments.** The SumUp RN package that does exist targets online checkout, and the npm entry `sumup-react-native-alpha` resolves to a third-party repo (`joao-smp/reactive-native-sdk`), latest 0.1.36 published 2024-02-07, description "test".
- Android Tap to Pay is *"a separate package"* from the reader SDK — two native dependencies, not one.
- **Android initialization is documented in the Application class** (`SumUpState.init(this)`), which is the only case in this survey where the vendor's own instructions put SDK startup on the process-launch path.

### PayPal Zettle
- SDKs are actively released ([sdk-ios 4.70.4](https://github.com/iZettle/sdk-ios/releases), [sdk-android 2.52.1](https://github.com/iZettle/sdk-android/releases)) but documentation lives on the [developer portal](https://developer.zettle.com/docs/payment-integrations/ios-sdk), a JS SPA.
- No RN wrapper, official or maintained. The old app-switch URL-scheme integration is deprecated in favour of the SDK ([iZettle/URL-Scheme](https://github.com/iZettle/URL-Scheme)).
- iOS requires the **External Accessory** background mode and an `UISupportedExternalAccessoryProtocols` entry for `com.izettle.cardreader-one` — a hardware-accessory declaration that ships in `Info.plist` whether or not the driver is ever used, and location strings that Zettle states are mandatory ("Zettle won't accept payments without these texts implemented").
- Android pulls modular artifacts (`com.zettle.sdk:core`, `com.zettle.sdk.feature.cardreader:ui`, `…feature.qrc:*`, `…feature.manualcardentry:ui`) from **GitHub Packages**, authenticated with a personal access token carrying `read:packages` — a build-time credential the CI must hold.
- Zettle offers no Tap to Pay to integrators; PayPal ships Tap to Pay only in its own merchant app.

### Adyen
- [Terminal API](https://docs.adyen.com/point-of-sale/design-your-integration/terminal-api/) cloud mode is the only integration in this survey that is card-present with **zero client-side code**: the POS server POSTs to an Adyen endpoint with an `x-API-key`. Local mode instead requires LAN comms to the terminal on port 8443 with an Adyen certificate.
- The **POS Mobile SDK** ([iOS](https://github.com/Adyen/adyen-pos-mobile-ios) v3.19.1, [Android](https://github.com/Adyen/adyen-pos-mobile-android) v2.19.0) covers Tap to Pay and the NYC1 reader. Android artifacts come from Adyen's Artifactory behind an `adyen.repo.xapikey` **SDK Download API key** set in `local.properties`.
- The Android repo is the only one here that ships a worked example of *not* shipping the SDK: `app-default` (automatic init), `app-manual-initialization`, and `app-dynamic` — the last loading the SDK via **Play Feature Delivery**, i.e. excluded from the base bundle and downloaded when a merchant enables it.
- `@adyen/react-native` 2.12.0 is Drop-in/Components (card-not-present) and is not a card-present path; [issue #776](https://github.com/Adyen/adyen-react-native/issues/776) asks for a Tap to Pay RN SDK with no official commitment.
- Tap to Pay on iPhone via Adyen: min **iOS 18.4**; Adyen documents separate TEST and LIVE Apple entitlements with LIVE approval taking "up to several weeks" ([iOS requirements](https://docs.adyen.com/point-of-sale/mobile-ios/requirements)).

### Mollie
[Terminals API](https://docs.mollie.com/reference/terminals-api) + a `pointofsale` payment carrying `terminalId`; status by webhook/poll. No iOS, Android or RN SDK for terminals — Mollie's mobile Swift package (`mollie-components-ios`) is checkout UI. Terminals are ordered through the dashboard. Tap to Pay on iPhone launched for UK merchants inside **Mollie's own app**; no public developer surface for a third-party app to invoke it.

### PayArc
[Payarc Connect](https://docs.payarc.net/reference/getting-started-1) is a cloud REST API driving a PAX terminal (sale, void, refund, auth, post-auth). Official SDKs are server-side only: [payarc-sdk](https://github.com/Payarc/payarc-sdk) (Node), [payarc-sdk-php](https://github.com/Payarc/payarc-sdk-php). No mobile or RN SDK was found. Gate is merchant underwriting/boarding, not code review.

### Authorize.net
Card-present processing still exists (retail API fields, Authorize.net's own mPOS and VPOS 2.0 apps), but the mobile client SDKs carry an explicit vendor deprecation: *"The iOS and Android versions of the In-Person SDK are deprecated and may not be supported in the near future. The Windows SDK is still fully supported."* ([in-person feature page](https://developer.authorize.net/api/reference/features/in-person.html)). Repos [inperson-sdk-ios](https://github.com/AuthorizeNet/inperson-sdk-ios) (4.5.1) and [inperson-sdk-android](https://github.com/AuthorizeNet/inperson-sdk-android) (1.9.5) are unarchived, last pushed 2026-03-09. Reference hardware (BBPOS Chipper 2X) is discontinued. No RN wrapper exists.

### Vipps MobilePay
[In-store flows](https://developer.vippsmobilepay.com/docs/recommended-flows/in-store/) are dynamic QR on a customer display, merchant-scans-customer-QR, phone-number push, or static QR. All REST (ePayment / QR / Webhooks APIs). No reader, no card-present SDK, nothing to gate beyond a camera. Production access needs a per-country merchant agreement, compliance checks and a live test transaction.

## 3. Harness implications (facts)

**Build-time inclusion is unavoidable for every native driver.** React Native autolinking discovers native dependencies from installed package metadata; the documented escape hatch is a per-platform `null` entry in `react-native.config.js` `dependencies`, which is a **build configuration choice, not a runtime one** ([RN CLI autolinking docs](https://github.com/react-native-community/cli/blob/main/docs/autolinking.md)). A package that is installed and not excluded is compiled in.

**What each native driver leaves in the binary even when never initialised:**
- Square: project-wide Xcode settings (`use_frameworks!`, User Script Sandboxing off, a build-phase script), five merged Android permissions, and a compileSdk 36 / AGP 8.9.1 / Kotlin floor that the whole app must meet.
- SumUp: iOS location + Bluetooth plist strings; Android minSdk 26 / targetSdk 36 / AGP 9.2.1 / Kotlin 2.4.0 / Java 17 floors; **plus an `Application`-class init in the vendor's own instructions**.
- Zettle: the External Accessory background mode and the `com.izettle.cardreader-one` accessory protocol in `Info.plist`; an `OAuthActivity` in the Android manifest; a GitHub PAT in the build environment.
- Stripe: config-plugin-injected Bluetooth background mode / local-network usage strings; iOS 15.1 and Android API 26 floors.
- Adyen POS Mobile: an Adyen-issued Artifactory key in the build environment (Android).

**Four integrations have no build-time native cost at all:** Adyen Terminal API (cloud), Mollie Terminals, PayArc Connect, and Vipps in-store — all server/REST. These are gateable by a config flag with nothing shipped.

**One vendor ships a documented way to keep a native SDK out of the base artifact:** Adyen's Android `app-dynamic` example loads the POS Mobile SDK through Play Feature Delivery. No equivalent exists for Square, SumUp, Zettle, Stripe, or Adyen iOS.

**Runtime gating (module linked, never initialised) is consistent with the documented API shape for Square, Stripe, Zettle iOS, SumUp iOS and Adyen iOS** — all expose an explicit `initialize`/`setup`/`start`/`authorize` the app calls. **SumUp Android is the exception**: the vendor documents `SumUpState.init(this)` in the Application class. Zettle documents configuration in `Application.onCreate()` / `didFinishLaunchingWithOptions` too, though its `sdk.start()` is separable.

**No vendor publishes a statement that its SDK refuses to coexist with another payment SDK.** That is an absence of documentation, not evidence of compatibility; the observable conflict surface is Gradle/Kotlin/AGP version pinning, `use_frameworks!` forcing dynamic linking on every pod, Android manifest permission merging, and `compileSdk` floors — all of which are pairwise resolvable only by testing.

**Vendor approval gates before production keys:**
- Square: application signature (bundle/package + signing identity) filed in the Developer Console — SDK ≥ 2.1.
- SumUp: Affiliate Key bound to bundle id / package name, ordered through SumUp.
- Zettle: Developer Portal Client ID; Android artifact access via GitHub PAT.
- Adyen: SDK Download API key for the Android artifacts; back-office merchant enablement for Tap to Pay.
- Stripe: no app-signature gate; Tap to Pay gated only by Apple.
- Mollie / PayArc / Vipps / Authorize.net: merchant underwriting or a merchant agreement, not a code gate.
- **Apple, for any Tap to Pay on iPhone driver regardless of PSP:** organization account, Account Holder requests the entitlement, Apple reviews against predefined criteria, and a *second* distribution entitlement must be re-requested before TestFlight or App Store.

## 4. Unsourced / unverified

- **Binary size.** No vendor in this survey publishes an app-size delta for its card-present SDK. Every "footprint" figure above is version floors, permissions and entitlements — not megabytes.
- **Apple's own statement of supported iPhone models / iOS floor.** Apple's developer pages say only "the latest version of iOS"; the concrete "iPhone XS or later, iOS within one year, PIN needs 16.4+" comes from Stripe's, Square's and SumUp's docs, which agree. Apple's authoritative list lives behind `register-docs.apple.com`, which was not fetched.
- **Apple entitlement turnaround.** Apple states no lead time. Adyen says LIVE approval "can take up to several weeks"; that is Adyen's number, not Apple's.
- **Whether Square's SDK is safe to leave linked-but-uninitialised** is inferred from the API shape (no launch-time hook documented), not from a vendor statement that this is supported. Same inference for SumUp iOS, Zettle, and Adyen iOS.
- **Zettle multi-tenant terms.** Whether one binary may serve many Zettle merchants ("partner-hosted") without separate Zettle approval was not confirmed from a fetched primary page.
- **SumUp multi-tenant terms and certification.** SumUp's docs name `integration@sumup.com` for certification questions but do not spell out a per-release review gate, and say nothing either way about one binary serving many merchant accounts.
- **Adyen's Android permission allowlist and 200 MB APK cap** are documented for apps that run *on Adyen terminal hardware*; whether they also bind a generic phone running the POS Mobile SDK was not confirmed.
- **PayArc mobile SDK.** None found on GitHub, npm, or the docs site. Absence of evidence, not a vendor statement that none exists.
- **Zettle SDK minimum Android/iOS runtime for the newest releases** was read from the current installation pages (iOS 12+, API 21+); those floors look older than the 2026 releases and were not cross-checked against a changelog.
