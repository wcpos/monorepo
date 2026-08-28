# Stripe Terminal on React Native / Expo — server vs client ownership

Research for wcpos/roadmap#99 (parent #97). Facts only; no WCPOS recommendations.
Sources: docs.stripe.com/terminal, github.com/stripe/stripe-terminal-react-native,
local clone `/Users/kilbot/Projects/stripe-terminal-react-native`, developer.apple.com.
Date: 2026-08-28. Docs pages render localised headings; quoted English text is verbatim.

## 1. Step × owner × reader class

Reader classes: **BT** = Bluetooth mobile readers (BBPOS WisePad 3, Stripe Reader M2);
**TTP** = Tap to Pay on iPhone / on Android; **Smart-SDK** = S700/S710, WisePOS E driven by
the RN SDK (`discoveryMethod: 'internet'`); **Smart-SD** = the same readers driven
server-side with no SDK ([server-driven](https://docs.stripe.com/terminal/payments/collect-card-payment.md?terminal-sdk-platform=server-driven)).

| Step | BT | TTP | Smart-SDK | Smart-SD |
|---|---|---|---|---|
| Terminal **Location** create (`POST /v1/terminal/locations`) | **Server** | **Server** | **Server** | **Server** |
| Terminal **Configuration** (tipping, `offline[enabled]`) | **Server** | **Server** | **Server** | **Server** |
| Reader **registration** to a Location | not required — `locationId` at connect | not required — `locationId` at connect | **Server** (`POST /v1/terminal/readers` w/ registration code) | **Server** |
| **ConnectionToken** mint (`POST /v1/terminal/connection_tokens`, secret key) | **Server** (mandatory) | **Server** (mandatory) | **Server** (mandatory) | n/a |
| Token delivery to SDK (`tokenProvider`) | Client | Client | Client | n/a |
| Discovery / connect | **Client SDK** | **Client SDK** | **Client SDK** | n/a (reader is online to Stripe) |
| **PaymentIntent create** | **Either** (client `createPaymentIntent` or server `POST /v1/payment_intents`) | **Either** | **Either** | **Server only** |
| `payment_method_types` must include `card_present` | yes | yes | yes | yes |
| `capture_method` choice | Either side, at create | Either | Either | **Server** |
| **collectPaymentMethod** | **Client SDK** | **Client SDK** | **Client SDK** | **Server** (`/collect_payment_method`) |
| **confirm / process** (authorization) | **Client SDK — must be** | **Client SDK — must be** | **Client SDK — must be** | **Server** (`/confirm_payment_intent`, `/process_payment_intent`) |
| **Capture** (when `capture_method=manual`) | **Server** | **Server** | **Server** | **Server** |
| **Cancel** uncaptured PI | Either (`cancelPaymentIntent` client, or server) | Either | Either | **Server** |
| Cancel *in-flight collection* | Client (`cancelCollectPaymentMethod` / `cancelProcessPaymentIntent`) | Client | Client | **Server** (`/cancel_action`) |
| **Online refund** | **Server** (`POST /v1/refunds`) | **Server** | **Server** | **Server** |
| **In-person refund** (Interac CA only) | Client SDK (`collectRefundPaymentMethod` + `confirmRefund`) | Client SDK | Client SDK | **Server** (`/refund_payment`) |
| **Webhooks** | Server (optional; useful for `requires_capture`) | Server | Server | **Server — required in practice** (`terminal.reader.action_succeeded/_failed/_updated`) |
| Offline store-and-forward | **Client SDK** (on POS device) | iPhone only, private preview | reader-side | **not supported** |

Hard "must be server-side" rules, verbatim:

- ConnectionToken: "your backend needs to give the SDK permission to use the reader … Your
  backend needs to only create connection tokens for clients that it trusts." … "The `secret`
  from the `ConnectionToken` lets you connect to any Stripe Terminal reader and take payments
  with your Stripe account. Be sure to authenticate the endpoint … and protect it from
  cross-site request forgery (CSRF)." … "Don't cache or hardcode the connection token. The SDK
  manages the connection token's lifecycle."
  ([setup-integration](https://docs.stripe.com/terminal/payments/setup-integration.md?terminal-sdk-platform=react-native))
  The API call takes the account **secret key**, so it cannot be made from the device.
- Confirmation must NOT be server-side: "Always confirm PaymentIntents using the Terminal SDK
  on the client. Server-side confirmation bypasses critical interactions, such as PIN prompts,
  and might result in transaction failures."
  ([collect-card-payment](https://docs.stripe.com/terminal/payments/collect-card-payment.md?terminal-sdk-platform=react-native))
- Capture is a backend call: "make sure it notifies your backend to capture the payment. Create
  an endpoint on your backend that accepts a PaymentIntent ID and sends a request to the Stripe
  API to capture it." "You must manually capture a PaymentIntent within 2 days or the
  authorization expires." (ibid.)
- After `collectPaymentMethod`, "you must authorize or cancel the payment within 30 seconds." (ibid.)
- Interac (CA): `interac_present` is single-message. `capture_method` must be `automatic`,
  `automatic_async` or `manual_preferred`; with `manual` "Interac card payments are always
  declined". "If you attempt to capture an `interac_present` payment, the Stripe API returns an
  error." "In-person refunds are mandatory for Interac transactions in Canada. You can't create
  refunds in the API or in the Dashboard for these payments."
  ([regional CA](https://docs.stripe.com/terminal/payments/regional.md?integration-country=CA))
  In-person refunds are supported on WisePad 3, WisePOS E, S700/S710, Tap to Pay on iPhone and
  Tap to Pay on Android ([refunds](https://docs.stripe.com/terminal/features/refunds.md)).
- Tipping is **server/Dashboard-owned config**, not a client parameter: on-reader tipping is set
  on a `Configuration` object (`tipping[usd][percentages][]`, `fixed_amounts`,
  `smart_tip_threshold`) assigned to the account or a Location. Supported on S700/S710,
  WisePOS E and **WisePad 3** (not Tap to Pay). The client may only override per-transaction
  with `skipTipping` / `tipEligibleAmount` on `collectPaymentMethod`. Before confirmation the tip
  is in `amount_tip`; after confirmation `amount` **includes the tip** and the tip appears in
  `amount_details.tip.amount`.
  ([on-reader tipping](https://docs.stripe.com/terminal/features/collecting-tips/on-reader.md))
- Server-driven cannot do everything the SDK can: "This integration type doesn't support offline
  card payments."

## 2. Offline payments

([overview](https://docs.stripe.com/terminal/features/operate-offline/overview.md?reader-type=bluetooth),
[collect while offline, RN](https://docs.stripe.com/terminal/features/operate-offline/collect-card-payments.md?terminal-card-present-integration=terminal&reader-type=bluetooth&terminal-sdk-platform=react-native))

- Supported: **mobile (BT) readers** and **smart readers**, on iOS/Android/**React Native** SDKs.
  **Tap to Pay on iPhone offline is private preview (US only)**; **"Tap to Pay on Android doesn't
  support offline mode."** Server-driven: not supported.
- BT precondition: must have connected online to a reader of the same type at the same Location
  within the last 30 days, with reader software updated in that window.
- Enabled via a `Configuration` object (`offline[enabled]=true`) assigned to a Location or the
  account default — i.e. **server-side switch**. "Configuration API changes can take several
  minutes to propagate … and require you to disconnect from and reconnect to your reader."
- Not accepted offline: **Interac**, girocard, NYCE/PULSE/STAR, QR payments. Swiping disallowed.
  In the EEA the customer must insert and enter a PIN. Tapping is not supported in SCA markets.
  Tipping is **not** supported offline on mobile or Tap to Pay readers (supported on smart readers).
  Incremental authorizations unsupported everywhere offline.
- Amount ceiling: "the transaction exceeds the Stripe-enforced offline maximum of **10,000 USD**
  or equivalent in your operating currency."
- Offline PaymentIntents are created **client-side** (`createPaymentIntent`) and have a **null
  `id`**. Stripe's own guidance: "add a custom identifier to the PaymentIntent's metadata to help
  reconcile PaymentIntent objects created offline in your database."
- `offlineBehavior`: `'prefer_online' | 'require_online' | 'force_offline'`
  (`src/types/index.ts:182` in the local clone). Risk levers exposed to the app:
  `OfflineStatus.sdk.offlinePaymentsCount`, `OfflineStatus.sdk.offlinePaymentAmountsByCurrency`,
  `OfflineStatus.sdk.networkStatus`; `getOfflineStatus()` (`src/functions.ts:728`).
- Forwarding: automatic on reconnect. **The token provider is called while offline** — "The SDK
  attempts to forward payments even if its network status is offline. This means your connection
  token provider might receive a request to provide a connection token even when the device is
  offline." Callbacks: `onDidChangeOfflineStatus`, `onDidForwardPaymentIntent(paymentIntent,
  error)`, `onDidForwardingFailure`.
- Capture semantics: with `automatic` the PI is `succeeded` after forwarding; with manual capture
  the app/backend must capture *after* forwarding — check `paymentIntent.offlineDetails
  .requiresUpload === false`, or listen for `requires_capture` via webhooks.
- "You can't cancel or refund a PaymentIntent that was created and confirmed offline until it's
  forwarded to Stripe."

## 3. Payment details available for receipts

([receipts](https://docs.stripe.com/terminal/features/receipts.md?terminal-sdk-platform=react-native))
Available "in the PaymentIntent object as soon as the payment is confirmed"; also server-side at
`charge.payment_method_details.card_present.receipt.*`, and client-side as `ReceiptDetails`.

| Field | Receipt name | Card-network requirement |
|---|---|---|
| `account_type` | Account type | **Required** (optional in US) |
| `application_preferred_name` | Application name | **Required** |
| `dedicated_file_name` | AID | **Required** |
| `authorization_response_code` | ARC | Optional |
| `application_cryptogram` | Application Cryptogram | Optional |
| `terminal_verification_results` | TVR | Optional |
| `transaction_status_information` | TSI | Optional |

Also available: card brand / funding / `wallet.type` from the collected PaymentMethod (wallet
detection "isn't guaranteed" until after authorization); cardholder language via
`payment_method.card_present.preferred_locales`. For Interac the co-brand is at
`payment_method_details.interac_present.brand` and the PaymentMethod type is always
`interac_present`.

**Offline:** receipt data comes from `paymentIntent.offlineDetails.offlineCardPresentDetails`
(contains a `ReceiptDetails` plus cardholder name and brand). "The `account_type` and
`authorization_response_code` receipt fields are unavailable on PaymentIntents processed
offline." Prebuilt email receipts (`receipt_email` on the PI) "are only sent after connectivity
is restored and the payment is successfully captured."

Stripe does not document an `emv_auth_data` field for Terminal receipts; the EMV data is the
seven fields above. (`emv_auth_data` as a name: **unverified**.)

## 4. Expo / React Native integration constraints

- Package: `@stripe/stripe-terminal-react-native`. **Still versioned as a beta / public preview**
  — npm `latest` is `0.0.1-beta.32` (registry, last modified 2026-07-30); the local clone is
  `0.0.1-beta.23` wrapping native SDK 4.1.0 (`package.json`, `git log`). Stripe's docs label the
  library "in public preview and in active development".
- Requirements (upstream `README.md`, main branch): **Android API level 26+**, `compileSdkVersion
  = 35`, `targetSdkVersion = 35`, minSdk cannot be lowered ("internal runtime API level
  validation"); **iOS 15.1+**; Babel 7.9+.
- **Expo Go is not supported**: "This package can't be used in the 'Expo Go' app because it
  requires custom native code. You must use `npx expo prebuild`". Install via
  `npx expo install @stripe/stripe-terminal-react-native`.
- **A config plugin ships with the package** (`app.plugin.js` → `src/plugin/withStripeTerminal.ts`).
  Props on main: `bluetoothBackgroundMode`, `locationWhenInUsePermission`,
  `bluetoothPeripheralPermission`, `bluetoothAlwaysUsagePermission`, `localNetworkUsagePermission`,
  `appDelegate`, `tapToPayCheck`. It sets iOS `UIBackgroundModes: ['bluetooth-central']`,
  `NSLocationWhenInUseUsageDescription`, `NSBluetoothAlwaysUsageDescription`,
  `NSBluetoothPeripheralUsageDescription`, `NSLocalNetworkUsageDescription`; adds Android
  `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`; adds
  gradle `android.jetifier.ignorelist=jackson-core`; creates a noop Swift file. With
  `appDelegate: true` it injects `TerminalApplicationDelegate.onCreate(this)`; with
  `tapToPayCheck: true` it injects `if (TapToPay.isInTapToPayProcess()) { return }`.
  Stripe's docs: `localNetworkUsagePermission` is "required for smart readers using LAN
  connection", `appDelegate` is "required for Tap to Pay on Android".
- The plugin does **not** add the Apple Tap to Pay entitlement — that must be added separately.
- Android runtime permissions come from `requestNeededAndroidPermissions(...)`. iOS location is
  load-bearing: "If the SDK can't determine the location of the iOS device, payments are disabled."
- **Tap to Pay on iPhone**: iPhone XS or later, on an iOS version no more than a year old; "Tap to
  Pay doesn't work on iOS betas"; PIN entry requires iOS 16.4+. Entitlement key
  `com.apple.developer.proximity-reader.payment.acceptance` (boolean true). Discovery
  `discoveryMethod: 'tapToPay'`; `locationId` **is** required at `connectReader`. First connect
  shows Apple's T&Cs and requires linking a business Apple ID (once per Stripe account); max 3
  unique Stripe accounts per iPhone per rolling 24h (`TapToPayReaderMerchantBlocked`). Apple
  requires a "How to Tap" education overlay (`ProximityReaderDiscovery`, iOS 18+) before review.
- **Tap to Pay on Android**: Android 13+, working NFC + ARM processor, non-rooted with locked
  bootloader, GMS-certified with Play Store, hardware keystore `FEATURE_HARDWARE_KEYSTORE` ≥ 100,
  security patch within 12 months, developer options **disabled**, stable internet.
  "Android device emulators don't support Tap to Pay" — including the simulated reader.
  PIN collection additionally requires no accessibility services, no screen recording, no overlay
  windows, or you get `TAP_TO_PAY_INSECURE_ENVIRONMENT`. TTP runs in a **separate process** that
  re-creates the `Application` — hence the `isInTapToPayProcess()` guard.
- **Apple entitlement process**: request the [Tap to Pay on iPhone Entitlement](https://developer.apple.com/contact/request/tap-to-pay-on-iphone/);
  "To access the request form, you need to have an organization-level Apple Developer account and
  be logged in as the Account Holder." A **non-distribution** entitlement is issued for testing; a
  **distribution** entitlement must be re-requested by replying to the original email before
  TestFlight or App Store submission. Stripe: "Implementing Tap to Pay on iPhone is a complex
  process that requires submitting your app to Apple for approval."
  **Lead time: not stated on either Apple's or Stripe's pages — unverified.**
- WCPOS context (facts): ADR 2026-04-21 requires native module packages to be declared in
  `apps/main/package.json` for Expo autolinking; ADR 2026-04-22 puts extra Android build
  constraints in a local config plugin. `apps/main` is on `expo ~57.0.13` /
  `react-native 0.86.2`, and `plugins/with-printer-support.js` already forces
  `minSdkVersion Math.max(rootProject.ext.minSdkVersion, 29)`.

## 5. Against the strawman

The §5 strawman is "prepare on server → collect on device → record/capture on server". It is
directionally right for SDK integrations but incomplete in six ways.

1. **Authorization happens on the device, not at server capture.** `confirmPaymentIntent` /
   `processPaymentIntent` runs in the SDK and Stripe forbids server-side confirmation. Money is
   committed at "collect"; the server step is only capture-or-nothing.
2. **"Capture on server" is conditional, not universal.** With `capture_method=automatic` (and
   always for Interac) the PI is already `succeeded` when the device returns — there is no server
   capture, and capturing an `interac_present` payment is an API error. The contract must carry
   the capture mode chosen at PaymentIntent creation, and a "nothing left to do" terminal state.
3. **"Prepare on server" is optional for SDK modes and forbidden for offline.** Client-side
   `createPaymentIntent` is supported on BT/TTP/Smart-SDK and is *required* to collect offline.
   Conversely it is impossible for server-driven smart readers.
4. **A whole class of steps has no place in the strawman: persistent, non-per-payment server
   duties.** ConnectionToken minting (called on connect, on reconnect, and even while offline),
   Location creation, reader registration, and the `Configuration` object that carries tipping
   and `offline[enabled]`. The contract needs a token endpoint and a reader/location identity
   that outlive any single payment.
5. **The amount can change after "prepare".** On-reader tipping is added on the reader and the
   confirmed `amount` includes it (`amount_details.tip.amount`). Whatever the server prepared is
   not necessarily what was authorized, so the "record" step must accept a returned amount.
6. **Offline breaks the identity assumption.** An offline PaymentIntent has a **null `id`** at
   sale time; correlation is by app-supplied `metadata`, and the real id arrives later via
   `onDidForwardPaymentIntent`. A contract keyed on "server returns a payment id, device returns
   the same id" cannot express this; it needs a client-minted correlation id and an
   out-of-band settlement event.

Additionally, **server-driven smart readers are not a "device SDK" capture mode at all** — no
client SDK is involved, the device is a UI shell, and the flow is server → `POST
/v1/terminal/readers/{id}/process_payment_intent` → `terminal.reader.action_succeeded` webhook.
It is a third mode alongside "server-side capture" and "device SDK", not a variant of either.
Refund also splits three ways: online refunds are always server-side, Interac in-person refunds
are `collectRefundPaymentMethod` + `confirmRefund` on the device
(`src/functions.ts:580,601`) for SDK modes and `POST /v1/terminal/readers/{id}/refund_payment`
for server-driven.
