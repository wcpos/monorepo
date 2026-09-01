# Research: mini-app delivery and webview bridge landscape

- **Date:** 2026-09-01
- **Wayfinder ticket:** wcpos/roadmap#123 (map: wcpos/roadmap#120 — App extensibility)
- **Question:** How should "mini-apps" (first: an interactive printer-setup wizard) be delivered into the React Native/Expo POS app (iOS, Android, web, Electron), and over what bridge?

## TL;DR recommendation

Deliver mini-apps as **remote web pages in the existing cross-platform WebView** (`@wcpos/components/webview`), hosted on a **wcpos-operated origin** (the same jsDelivr/GitHub-tag CDN discipline as the web bundle for static assets, plus a small wcpos service for the search/AI flows), speaking a **versioned JSON postMessage protocol** that formalises the payment webview's ad-hoc `{action, payload}` shape into `{version, id, action, payload}` request/response envelopes with a host-provided capability handshake. Native-side device operations (printer discovery, test print, saving the printer profile) stay in the host app and are exposed to the mini-app as bridge calls — the mini-app is UI + flow logic only. This is the uncontroversial lane on both stores (remote web content in the platform WebView; Apple's downloaded-code rule 2.5.2/ADPLA 3.3.1(B) and Google Play's webview exemption both permit it), requires no OTA/expo-updates decision, works identically on iOS/Android/web/Electron, and lets the wizard ship daily without an app-store release. Bundle a minimal offline fallback (static "set up your printer manually" screen) rather than trying to make the wizard itself offline-capable.

---

## 1. App-store policy: what's actually permitted

All quotes verified against the raw pages on 2026-09-01.

### 1.1 Apple App Review Guideline 2.5.2 (verbatim)

> "Apps should be self-contained in their bundles, and may not read or write data outside the designated container area, nor may they download, install, or execute code which introduces or changes features or functionality of the app, including other apps. Educational apps designed to teach, develop, or allow students to test executable code may, in limited circumstances, download code provided that such code is not used for other purposes. Such apps must make the source code provided by the app completely viewable and editable by the user."
> — https://developer.apple.com/app-store/review/guidelines/

**Correction to the folk understanding:** the current 2.5.2 text contains **no WebKit/JavascriptCore exception clause** — only the education carve-out. The interpreted-code exception lives in the **Developer Program License Agreement §3.3.1(B)** (successor to the old §3.3.2), and it is now broader than the historical "WebKit or JavascriptCore only" wording:

> "Except as set forth in the next paragraph, an Application may not download or install executable code. Interpreted code may be downloaded to an Application but only so long as such code: (a) does not change the primary purpose of the Application by providing features or functionality that are inconsistent with the intended and advertised purpose of the Application (b) does not bypass signing, sandbox, or other security features of the OS; and (c) for Applications distributed on the App Store, does not create a store or storefront for other Applications." (There follows the programming-environment education exception.)
> — https://developer.apple.com/support/terms/apple-developer-program-license-agreement/ §3.3.1(B)

So downloaded **interpreted** code from *any* interpreter (Hermes included, not just WebKit/JSC) is permitted, conditioned on primary-purpose, no-security-bypass, and no-storefront. §3.3.1(C) separately forbids unlocking "additional features or functionality through distribution mechanisms other than the App Store" without approval or IAP. Guideline 2.5.6 (verbatim): "Apps that browse the web must use the appropriate WebKit framework and WebKit JavaScript. You may apply for an entitlement to use an alternative web browser engine in your app. Learn more about these entitlements for the EU and Japan."

### 1.2 Apple guideline 4.7 — mini apps (verbatim)

> "Mini apps, mini games, streaming games, chatbots, plug-ins, and game emulators — Apps may offer certain software that is not embedded in the binary, specifically HTML5 and JavaScript mini apps and mini games, streaming games, chatbots, and plug-ins. Additionally, retro game console and PC emulator apps can offer to download games. You are responsible for all such software offered in your app, including ensuring that such software complies with these Guidelines and all applicable laws. Software that does not comply with one or more guidelines will lead to the rejection of your app. You must also ensure that the software adheres to the additional rules that follow in 4.7.1 through 4.7.5."

The additional rules (verbatim, condensed to operative text):

- **4.7.1**: offered software "must: follow all privacy guidelines … include a method for filtering objectionable material, a mechanism to report content and timely responses to concerns, and the ability to block abusive users; and follow Guideline 3.1 in order to offer digital goods or services to end users." (So monetisation inside mini-apps = IAP rules; there is no literal "must be free" clause in current text.)
- **4.7.2**: "Your app may not extend or expose native platform APIs or technologies to the software without prior permission from Apple."
- **4.7.3**: "Your app may not share data or privacy permissions to any individual software offered in your app without explicit user consent in each instance."
- **4.7.4**: "You must provide an index of software and metadata available in your app. It must include universal links that lead to all of the software offered in your app."
- **4.7.5**: "Your app must provide a way for users to identify software that exceeds the app's age rating, and use an age restriction mechanism based on verified or declared age to limit access by underage users."

### 1.3 Google Play — Device and Network Abuse (verbatim)

> "An app distributed via Google Play may not modify, replace, or update itself using any method other than Google Play's update mechanism. Likewise, an app may not download executable code (such as dex, JAR, .so files) from a source other than Google Play. **This restriction does not apply to code that runs in a virtual machine or an interpreter where either provides indirect access to Android APIs (such as JavaScript in a webview or browser).**"
> "Apps or third-party code, like SDKs, with interpreted languages (JavaScript, Python, Lua, etc.) loaded at run time (for example, not packaged with the app) must not allow potential violations of Google Play policies."
> — https://support.google.com/googleplay/android-developer/answer/9888379

Listed violation example worth noting for bridge design: "a webview with added JavaScript Interface that loads untrusted web content (for example, http:// URL) or unverified URLs obtained from untrusted sources". Our bridge must therefore load only **https URLs from a wcpos-controlled allowlist** — never merchant-supplied or search-result URLs — into any webview that has the bridge interface attached.

### 1.4 OTA JS updates (expo-updates / CodePush) in practice

Expo's official position: OTA may change "non-native pieces (such as JS, styling, and images)" and "your updates need to follow the App Store and Play Store guidelines" (https://docs.expo.dev/eas-update/faq/). Hermes is neither WebKit nor JSC, but under the current §3.3.1(B) that distinction no longer matters — bytecode executed by an interpreter shipped in the reviewed binary is treated as interpreted code. Enforcement for ~a decade has targeted *what the update does* (changing the app's advertised purpose, hidden/dormant features under 2.3.1, JS-to-native-API bridges handed to downloaded code — the JSPatch 2017 crackdown), not the mechanism. On Google the exemption is explicit and purely technical.

### 1.5 Where the line is for wcpos mini-apps

- **Remote web content rendered in the platform WebView is the uncontroversial lane** on both stores — it is exactly what the payment webview already does.
- **First-party mini-apps** (wcpos-authored wizard UI) served remotely into a WebView do not make the app a 4.7 "mini-app platform" in the problematic sense; the constraints that still bind are 2.5.2's spirit (don't change the app's advertised purpose — a printer-setup wizard *is* the advertised purpose), 4.7.2's principle (don't expose raw native APIs to remote code — hence a narrow capability bridge, not a generic native bridge), and Google's untrusted-content rule (allowlisted https origins only).
- **If wcpos ever opens the catalog to third-party mini-apps**, 4.7 kicks in for real: index with universal links (4.7.4), per-instance consent for data sharing (4.7.3), IAP for digital goods (4.7.1), age gating (4.7.5), and no native-API extension without Apple permission (4.7.2). The capability-scoped bridge recommended in §5 is what makes that future compliant-by-construction.
- **OTA JS bundles** (expo-updates) are also policy-viable if ever needed — the blocker is engineering cost and fit, not policy (§3).

## 2. House precedents in the monorepo

### 2.1 Payment webview postMessage protocol

Files: `packages/core/src/screens/main/pos/checkout/components/payment-webview.tsx`, `packages/components/src/webview/index.tsx` (native), `index.web.tsx` (web).

**What it is.** The checkout screen loads the merchant store's order-pay page (a remote URL on the merchant's WordPress site, JWT appended as a query param) into a cross-platform `WebView` component. Protocol:

- app → page: `{action: 'wcpos-process-payment'}` — injected via `injectJavaScript` on native (synthesised `MessageEvent` dispatched at both `window` and `document`); `contentWindow.postMessage(message, '*')` on web.
- page → app: `{action: 'wcpos-payment-received', payload: <order JSON>}` via `window.postMessage` (stringified JSON on native, parsed by the wrapper; structured clone on web).
- Fallback: because the page may never post (gateway redirects, broken templates), the app polls the REST `orders` endpoint after the second load event and reconciles from server truth.

**What it gives a mini-app bridge:**
- A proven, already-abstracted cross-platform WebView with a unified `postMessage`/`onMessage` surface over `react-native-webview` (iOS/Android/Electron via RN) and `<iframe>` (web). Electron and web share the iframe path; native gets `injectJavaScript`.
- The `{action, payload}` message idiom and JSON-string transport quirks are already solved (native stringifies; web structured-clones; the wrapper normalises).
- Real-world lessons encoded in comments: readiness gating (no load event ⇒ no listener ⇒ messages vanish), navigation re-gating, error states, and "the page never acks" fallbacks.

**Where it falls short as a mini-app bridge:**
- **No protocol versioning or handshake.** The page can't discover what the host offers; the host can't tell what protocol the page speaks. Payment survives because there is exactly one message each way.
- **No request/response correlation.** Fire-and-forget messages only; no `id`, no reply routing, no timeouts. A wizard needs RPC ("scan for printers", await result list).
- **No origin checking.** The web listener accepts `message` events from any origin on `window` (capture phase) — fine-ish for one trusted URL, not for a generalised bridge. `postMessage(message, '*')` likewise. A mini-app bridge must pin origins both ways.
- **No capability injection.** The page gets nothing from the host except the JWT in the URL — no store context, no i18n locale, no theme.
- **Readiness is inferred from load events** because the store template sends no ready message; a mini-app protocol should start with an explicit `ready`/`hello` handshake instead.

### 2.2 Receipt template system

Files: `packages/core/src/screens/main/receipt/` (hooks `use-templates-sync.ts`, `use-template-renderer.ts`, `use-active-templates.ts`), `packages/printer/src/encoder/render-preview`, `apps/template-studio`.

**What it is.** Receipt templates are **server-delivered content, not code**: the WP plugin's `templates` REST endpoint returns the full template set in one response; the app upserts it into a local RxDB `templates` collection (ADR 0025 carve-out — no engine collection, one direct fetch through the HTTP seam) and renders read-only from there. Two engines (`logicless`, `thermal`), both interpreters that run **in the app**, so rendering works fully offline from the local copy plus locally-built receipt data (`buildReceiptData`) when the receipts API is unreachable, with an 8 s settle deadline so a hung fetch never blocks printing. `apps/template-studio` is a separate Vite app for authoring/previewing templates with snapshot specs.

**What it gives a mini-app bridge:**
- The house pattern for **server-delivered, locally-cached, offline-renderable content** with sync-on-wake, in-flight de-dupe, and per-row parse/validate before upsert. If mini-apps were "templates plus logic", this is the delivery rail.
- Proof that "merchant's WordPress serves the content" works and inherits the store's auth for free.
- The two-engine experience is a warning: every new "engine" (interpreter) multiplies test surface across four platforms.

**Where it falls short:**
- Templates are **declarative documents interpreted by shipped code** — they cannot express new interactive flows. A wizard with branching, device I/O, and AI calls is code, not a template; stretching the template engines into a mini-app runtime would mean building a third, much bigger engine.
- Delivery via the merchant's WordPress means update velocity is coupled to **plugin releases** (and merchants who never update). The wizard needs to iterate daily; templates iterate on the plugin release train.
- No UI surface: templates render to static HTML for print/preview, not to interactive screens.

### 2.3 Expo `'use dom'` usage

Files: `packages/printer/src/raster/receipt-rasterizer.dom.tsx`, `packages/core/src/screens/main/support/discord.tsx`, `packages/components/src/tree/tree-dom.tsx`.

**What it is.** Expo DOM components (`'use dom'` directive): a React component authored against real DOM APIs is compiled by Expo into a **bundled web page rendered in a WebView on native** (plain component on web). Props are serialised across the boundary; function props become async message-passing RPC (`onEncoded`/`onError` in the rasterizer are exactly this). The app uses it where real DOM is required: html-to-image rasterisation of receipts for ESC/POS raster printing, the WidgetBot Discord embed, and a JSON tree viewer.

**What it gives a mini-app bridge:**
- First-class, typed, already-working bridge — no hand-rolled postMessage, props/callbacks just work; the rasterizer's render→capture→encode round-trip proves non-trivial data (base64 raster bytes) crosses it fine.
- Web UI skills/libraries inside the native app with zero app-store concern: the JS is **bundled at build time** with the app binary.

**Where it falls short:**
- **Bundled at build time is the point — and the problem.** A `'use dom'` component updates only via an app-store release (absent expo-updates). It solves "web tech inside the app", not "remotely updatable mini-app". 
- Ships none of the app CSS (the rasterizer had to inline-port its paper-frame styles) — each DOM component is its own little island.
- It is an Expo/native construct: on web it degrades to an ordinary component, which is fine, but it offers no story for content served by a third party or updated server-side.

### 2.4 Other relevant local facts

- **The web app is already CDN-delivered**: `apps/web` loads the Expo web bundle from `https://cdn.jsdelivr.net/gh/wcpos/web-bundle@<version>/...` via `window.cdnBaseUrl`, bootstrapped by the PHP plugin. Tagging a bundle version is a production deploy; the OPFS worker had to be vendored into the plugin because plugin-served and CDN-served code drift. Operating "wcpos-hosted static content, versioned by git tag, fronted by jsDelivr" is an existing muscle, not new infrastructure.
- **expo-updates is NOT installed** (`apps/main/package.json` has no expo-updates; no CodePush). There is no OTA channel today; the native app updates only through stores.
- The app already depends on a wcpos-adjacent third-party service (Novu for notifications), so "the app talks to a wcpos-operated backend" has precedent.

## 3. Hosting options for mini-app content

| Option | Versioning | Offline | i18n | Update velocity | Notes |
|---|---|---|---|---|---|
| **Bundled (in-app, e.g. `'use dom'`)** | App release train | Perfect | App's own i18n | Weeks (store review) — worst | Wrong for a fast-evolving wizard; right for the offline fallback shell |
| **Merchant's WordPress plugin** | Plugin release train + merchant update lag | Good (same LAN as terminal, often) | Would need plugin-side packs | Weeks-to-never (merchants skip updates) | Right for store-coupled content (templates, order-pay); wrong for wcpos-owned product flows |
| **wcpos-operated CDN/service** | Git tag → jsDelivr (existing muscle) or versioned path; app pins a channel | Requires fallback UI when unreachable | Served with content; can reuse app locale via bridge handshake | **Hours** — deploy on merge, no store or plugin release | The wizard's Google-search/AI-assistance flows need a wcpos backend **anyway**, so the origin must exist regardless |

**Assessment.** The wizard's AI/search assistance already forces a wcpos-operated backend; once that exists, serving the wizard UI from the same origin is the marginal-cost option and the only one matching the required update velocity. Version by URL path or channel (`/mini-apps/printer-wizard/v1/`), pin a major version in the app, let minors float. Offline: don't chase an offline wizard — printer *setup* is an online-adjacent activity (searching for drivers/models is inherently online); ship a small bundled fallback screen (manual IP/port entry — which already exists as native settings UI) shown when the mini-app origin is unreachable. i18n: hand the app's locale to the page in the handshake; the page ships its own strings (decoupled from the app's translation pipeline, which is a feature for fast iteration).

**On expo-updates / OTA:** introducing OTA would let bundled `'use dom'` mini-apps update outside store releases and is policy-compliant on both stores (see §1). But it updates the **whole app bundle**, couples mini-app velocity to app release engineering (channels, rollbacks, signing), adds a new production system, and does nothing for the web/Electron targets (web is already CDN-updated; Electron would need its own updater story). It would help only if mini-apps needed deep native API access that a WebView bridge can't provide. For UI-plus-bridge mini-apps it is the heavier tool; keep it a separate decision and don't gate the wizard on it.

## 4. Shopify POS UI extensions and Square's app model

### 4.1 Shopify POS UI extensions — native components driven by sandboxed JS

- **Rendering: native components, NOT webviews.** Extension code (JS/TSX, Preact-scaffolded) runs in a sandbox — a Web Worker on web, a hidden WebView-as-sandbox on Android, JavaScriptCore on iOS — and builds a component tree with Shopify's **Remote DOM** (successor to remote-ui). The tree is serialised over a message channel to the host POS app, which renders **real native components** from Shopify's design system. The sandbox strips dangerous globals (`importScripts` removed, `fetch` replaced with a domain-restricted version).
- **Bridge shape:** an injected global `shopify` object whose surface depends on the extension target. Host APIs: Cart, Navigation, Storage, Toast, modal presentation (`shopify.action.presentModal()`), Locale, Connectivity, Device, barcode Scanner, PinPad, Cash Drawer, Camera, print, plus contextual data (`shopify.customer.id`, `shopify.product.id`). Auth: requests to the app's own domain automatically carry an ID token; `fetch('shopify:admin/api/graphql.json')` gives scoped direct Admin API access.
- **Targets:** Tile (smart-grid home), Action (menu item + full-screen modal), Block (inline on native screens), plus event-observation targets (`pos.transaction-complete.event.observe`).
- **Restrictions:** no arbitrary DOM, only Shopify's component set (`<s-tile>`, `<s-box>`, …), styling via props only, network restricted to the app's domain + `shopify:admin`, compiled bundle capped at **64 KB**. Offline execution is opt-in (`runs_offline`, POS 11.0+) but authenticated calls don't work offline.
- **Distribution:** extensions ship as part of a Shopify app via `shopify app deploy`; Shopify hosts and serves the bundle (no per-device install), on quarterly API versions supported ≥12 months.
- Sources: https://shopify.dev/docs/api/pos-ui-extensions/latest, https://shopify.engineering/remote-rendering-ui-extensibility, https://github.com/Shopify/ui-extensions

### 4.2 Square — no third-party UI inside the POS

Square (as of 2026) has **no Shopify-style in-POS extension surface**. The App Marketplace is OAuth-connected web apps living *outside* the POS; the next-gen unified Square POS "add-on library" surfaces first-party feature modules and launch points/links to installed marketplace integrations, with **no public webview-bridge or component SDK for third parties**. Developer surfaces are "integrate around Square": Point of Sale API (app-switch deep links with callbacks), Terminal API, Mobile Payments SDK (embed Square payments in your own app). Sources: https://developer.squareup.com/docs/pos-api/how-it-works, https://squareup.com/help/us/en/article/7697-get-started-with-add-ons

### 4.3 Other precedents (brief)

- **Clover:** third-party apps are real Android APKs from the Clover App Market with full SDK/hardware access, gated by Clover app review — the maximal-trust model, only possible because Clover owns the hardware.
- **WeChat mini programs:** dual-thread — developer JS runs in an isolated logic thread (JavaScriptCore, no DOM); the view layer (WXML/WXSS) renders in WebViews (or the newer Skyline native-render engine); all communication relayed through the native JSBridge via `setData()` serialisation. The closest architectural cousin to Shopify's model at superapp scale.

**Takeaway for wcpos:** the industry pattern for third-party/remote UI in a host POS is *sandboxed guest logic + serialised bridge + host-controlled capability API + platform-hosted distribution*. Shopify spends enormous engineering on native-rendered remote UI because its extensions are third-party at scale; for **first-party** mini-apps, a WebView with a hardened postMessage bridge buys the same architecture at a fraction of the cost, and the capability-scoped bridge design keeps the door open to a Remote-DOM-style native renderer later without changing the mini-app contract.

## 5. Recommended delivery + bridge shape

**Delivery.**
1. Mini-apps are **remote web apps** (any web stack; likely the same React/Tailwind skills as template-studio) served from a wcpos-operated origin, one directory/channel per mini-app, major version pinned by the host.
2. The host app gains a generic `MiniAppHost` screen: the existing `@wcpos/components/webview` + a new bridge module. Adding a new mini-app to the catalog is data (id, title, URL, required capabilities), not an app release — the app fetches the catalog from the same origin, with a bundled seed for first paint.
3. Offline/unreachable ⇒ bundled fallback screen per mini-app slot (for the printer wizard: the existing manual printer settings).

**Bridge.** Formalise the payment-webview idiom into a versioned envelope, hardened where §2.1 falls short:

```jsonc
// page → host and host → page share one envelope
{ "wcpos": 1,                 // protocol major version
  "id": "uuid",              // correlation id (present on requests & responses)
  "action": "printers.scan", // namespaced
  "payload": { ... } }
```

- **Handshake first**: page posts `app.ready`; host replies `app.init` with `{locale, theme, platform, store: {…safe subset…}, capabilities: [...]}`. Nothing else flows until then (fixes the payment webview's inferred-readiness problem).
- **Request/response RPC with timeouts** on top of the envelope; plus host-initiated events (`printers.statusChanged`).
- **Capability-scoped host API**, granted per mini-app from its catalog entry — for the printer wizard: `printers.scan`, `printers.testPrint`, `printers.saveProfile`, `http.proxy` (host-mediated REST to the merchant store, so the page never holds the JWT — fixing the token-in-URL wart), `ui.toast`, `ui.close`. Native device work stays in the shipped app (`packages/printer`); the mini-app is flow + UI only, which is also what keeps the app clear of Apple 4.7.2's "may not extend or expose native platform APIs" line and Google's untrusted-JS-interface violation example.
- **Origin pinning both directions** (check `event.origin` against the mini-app's URL; `postMessage(msg, expectedOrigin)` not `'*'`), and keep the payment webview's lesson: never trust the page to ack — host-side state must reconcile from its own truth.

**Why this generalises.** The same host screen + bridge serves future mini-apps (onboarding tours, hardware diagnostics, gateway-specific setup) by adding catalog entries and capability grants. It is the same architectural shape as Shopify POS UI extensions (sandboxed guest code + host-provided typed API + Shopify-controlled distribution) adapted to our stack's cheapest sandbox — the WebView we already ship — and it leaves three doors open without committing to them: `'use dom'` for a mini-app that must work fully offline, expo-updates if a mini-app ever needs native APIs, and third-party mini-apps later by adding a review/signing step to the catalog.
