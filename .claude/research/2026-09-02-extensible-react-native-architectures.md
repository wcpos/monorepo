# Extensible React Native app architectures: how teams that know React build insertion points

- **Ticket**: wcpos/roadmap#140 (app extensibility — the `slot` primitive)
- **Date**: 2026-09-02
- **Question**: What registration shape, props contract, and delivery mechanism should a named UI insertion point ("slot") have in an offline-first Expo/RN app targeting web, Electron, iOS and Android — first-party consumers now, third-party WooCommerce-plugin authors later?
- **Method**: primary sources only — react.dev / legacy.reactjs.org, reactnative.dev, docs.expo.dev, re-pack.dev, shopify.dev, the Shopify/remote-dom repo, Apple's App Review Guidelines, Google Play policy, and directory/config listings read from OSS RN app repos via the GitHub API. Secondary summaries not used. Anything unverified is marked **Unverified**.
- **Exclusion (owner rule)**: WordPress/WooCommerce prior art — SlotFill, hooks/filters, `registerPlugin` — is deliberately **excluded** from this survey and contributed nothing to the conclusions below. It is named here only to record the exclusion.

---

## 1. Registration and insertion

### 1.1 React itself has no plugin API — and says so by omission

There is no first-party React extensibility/plugin document. What the React team does publish is a consistent preference for **composition**, and explicit warnings against the two mechanisms a naive slot system reaches for.

- **Elements as props is React's "slots"**, stated in exactly those terms: "While this is less common, sometimes you might need multiple 'holes' in a component… React elements like `<Contacts />` and `<Chat />` are just objects, so you can pass them as props like any other data. This approach may remind you of 'slots' in other libraries but there are no limitations on what you can pass as props in React." ([Composition vs Inheritance](https://legacy.reactjs.org/docs/composition-vs-inheritance.html)) The same page rejects inheritance hierarchies outright: "we haven't found any use cases where we would recommend creating component inheritance hierarchies."
- **Context is a last resort.** "Just because you need to pass some props several levels deep doesn't mean you should put that information into context." Try props, then "Extract components and pass JSX as `children`"; "If neither of these approaches works well for you, consider context." ([Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context))
- **Do not introspect what was inserted.** "Manipulating children with the `Children` methods often leads to fragile code… When you can, try to avoid using the `Children` methods." Critically for ordering/wrapping schemes: "The `children` data structure **does not include rendered output** of the components you pass as JSX… There is no way to get the rendered output of an inner component." The prescribed alternatives are exposing multiple components, **accepting an array of objects as a prop**, or a render prop. ([`Children`](https://react.dev/reference/react/Children))
- **Portals** move DOM placement only: "A portal only changes the physical placement of the DOM node. In every other way, the JSX you render into a portal acts as a child node of the React component that renders it… events bubble up from children to parents according to the React tree." The `domNode` "must already exist," and "Passing a different DOM node during an update will cause the portal content to be recreated." ([`createPortal`](https://react.dev/reference/react-dom/createPortal)) That makes portals a *placement* tool, not a *registration* tool — and DOM-only, so it does not cross to RN.
- **`use` relaxes the conditional-call rule**: "Despite its name, `use` is not a Hook. Unlike Hooks, it can be called inside loops and conditional statements like `if`." It "must be called inside a Component or a Hook" and "cannot be called inside a try-catch block." ([`use`](https://react.dev/reference/react/use)) Useful for a slot host reading a per-slot context conditionally; not a registration mechanism.

**Read-through:** React's own answer to "put UI here" is *an array of objects passed as a prop*, resolved outside the render tree. That is the shape the rest of this survey converges on independently.

### 1.2 React Native's TurboModule registry: name key + typed spec + cheap metadata

The New Architecture's module registration is the closest thing in the RN ecosystem to a first-party "registry" pattern, and it is worth copying structurally.

- A module is declared as a **typed spec file** exporting an interface plus a registry lookup: `export default TurboModuleRegistry.getEnforcing<Spec>('NativeLocalStorage')`. "The specification declares the methods and data types that will pass back and forth between your native code and the React Native JavaScript runtime." ([Turbo Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction))
- Lookup is **by name string**, with an explicit availability distinction: `get<T>(name)` "will return `null` if the Turbo Native Module is unavailable"; `getEnforcing<T>(name)` "will throw an exception if the Turbo Native Module is unavailable."
- Registration on the native side is a **factory keyed by name** plus a separate **cheap metadata record** — `ReactModuleInfo(name, className, canOverrideExistingModule, needsEagerInit, isCxxModule, isTurboModule)` — so the host knows a module exists, and its flags, without constructing it. `getModule(name, ctx)` only constructs on demand.
- Codegen turns the spec into the native-side type contract; the New Architecture replaced the async bridge with JSI, "an interface that allows JavaScript to hold a reference to a C++ object and vice-versa" ([New Architecture landing page](https://reactnative.dev/architecture/landing-page)).

**Read-through:** name key → factory, with a *separate metadata object* that is safe to enumerate before anything is instantiated. That two-layer split (metadata vs. implementation) is exactly what an ordered, per-till-configurable slot needs: you must be able to list, order and persist slot entries without mounting them.

### 1.3 Callstack Re.Pack + Module Federation 2: runtime containers, hard mobile ceilings

Re.Pack is the only credible route to loading third-party JS into a running RN app.

- Host declares `remotes: { module1: "module1@http://example.com/module1.container.bundle" }`; the remote declares `filename` for its container bundle and `exposes: { "./entry": "./src/entry.js" }`. `ModuleFederationV2Plugin` adds `react` and `react-native` as shared with `singleton: true, eager: true` by default, uses the `loaded-first` share strategy, and defaults `reactNativeDeepImports: true` so RN sub-path imports stay one instance. ([ModuleFederationV2Plugin](https://re-pack.dev/api/plugins/module-federation-v2))
- The documented mobile limitations are the ceiling on any third-party-code ambition: "You must use the same React, React Native and native dependencies versions across all MFEs"; "All native modules need to be available in the host application (the one that is released to app stores)"; "You can only dynamically load JavaScript code from a microfrontend." Version management "is challenging to handle on your own and can be quite cumbersome based on our experience." And the warning: "Adopting this architecture, as with any other engineering design choice, comes with its own complexity. Make sure the trade-offs are worth it." ([Microfrontends](https://re-pack.dev/docs/getting-started/microfrontends))
- The v4 docs state the structural reason React/RN must be eager singletons: "React Native requires JavaScript code to synchronously perform initialization, meaning React and React Native must be available in the main bundle… it's not possible to load all of the JavaScript code dynamically." ([v4 Module Federation](https://v4.re-pack.dev/docs/module-federation))

**Unverified:** whether Re.Pack (Rspack-based, replacing Metro) composes with Expo prebuild/config plugins and Expo Router as used in this monorepo. Not tested here; treat adopting it as a bundler migration, not a feature flag.

### 1.4 Shopify: targets declared in config, one module per target

The strongest documented model, and the one whose *contract* is separable from its *isolation*.

- Declaration is config, not code discovery. `shopify.extension.toml` carries `api_version = "2026-07"` and one block per placement:
  ```toml
  [[extensions.targeting]]
  target = "pos.home.tile.render"
  module = "./src/Tile.tsx"
  ```
  `target` is "An identifier that specifies where you're injecting your extension into the POS interface"; `module` is the file that "exports the extension function that renders your UI or handles events." An optional `[extensions.supported_features]` can set `runs_offline = true`. ([POS UI extensions](https://shopify.dev/docs/api/pos-ui-extensions))
- The target vocabulary is a **closed, screen-scoped list** with a repeating triple — `.block.render`, `.action.menu-item.render`, `.action.render` — across home/product/customer/order/draft-order/register/post-purchase/cart-line-item, plus a UI-less `pos.app.ready.data` that "observes POS host events without rendering UI" and "starts when POS loads and runs for the session's lifetime." ([Targets](https://shopify.dev/docs/api/pos-ui-extensions/latest/targets))
- The module's default export mounts a Preact tree onto `document.body`; UI is Shopify's own web components (`<s-tile>`, `<s-pos-block>`, `<s-box>`, `<s-text>`, `<s-button>`) "built with remote-dom." Compiled bundle "can't exceed 64 KB," checked at `shopify app deploy`.

### 1.5 Expo Router: file-system routes, and `<Slot />` is not a slot

Expo Router derives navigation from files: "When a file is added to the **app** directory, the file automatically becomes a route in your navigation" ([Introduction](https://docs.expo.dev/router/introduction/)). Its `<Slot />` is "the `Slot` component, which serves as a placeholder for the current child route" — a layout outlet used when you want a layout without a navigator ([Layouts](https://docs.expo.dev/router/basics/layout/)). It renders *the matching child route*, chosen by the URL. There is **no** named-insertion-point, plugin-route, or external-registration mechanism anywhere in the Router docs surveyed. Naming a wcpos primitive `Slot` will collide with this concept in developers' heads; prefer a distinct name.

### 1.6 What well-built OSS RN apps actually do: nothing dynamic

Read directly from the repos:

- **Bluesky** (`bluesky-social/social-app`): `src/` holds `components/`, `screens/`, `state/`, `view/`, `alf/`, and a thin `features/` (only `gifPicker`, `inviteFriends`, `liveEvents`, `liveNow`, `nuxs`). Composition is a hand-written provider stack in `src/App.tsx` — ~30 statically imported `Provider as XProvider` from `#/state/*` nested by hand. No registry, no dynamic insertion.
- **Expensify** (`Expensify/App`): `src/` is `components/`, `pages/`, `libs/`, `hooks/` plus top-level constants files (`ROUTES.ts`, `SCREENS.ts`, `NAVIGATORS.ts`, `ONYXKEYS.ts`). Extension points are *enumerated constants*, not registrations.
- **Mattermost mobile** (`mattermost/mattermost-mobile`): the closest to a slot model — `app/products/{agents,boards,calls,playbooks}`, each with its own `screens/`, `state/`, `actions/`, `database/models`, `database/schema`. But the wiring is **build-time path aliases** in `tsconfig.json` (`"@calls/*": ["app/products/calls/*"]`, `"@playbooks/*"`, `"@boards/*"`, `"@agents/*"`), i.e. static imports with a naming convention. No runtime product registry.

**Read-through:** none of the three best-known OSS RN apps ship a runtime plugin registry. Feature modularity at their scale is directory convention + static imports + enumerated constants. A registry is only worth building if third parties are genuinely coming.

---

## 2. Data in, writes out

### 2.1 Shopify: readonly signal in, enumerated methods out, `editable` guard

`shopify.cart.current` is a `ReadonlySignalLike<Cart>` — `{ value: T; subscribe: (fn) => () => void }` — that "Provides read-only access to the current cart state and allows subscribing to cart changes." Writes are a closed method list: `addLineItem`, `addCustomSale`, `removeLineItem`, `clearCart`, `add/removeCartProperties`, `add/removeLineItemProperties`, `applyCartDiscount`, `addCartCodeDiscount`, `setLineItemDiscount`, `setCustomer`, `addAddress`, `setAttributedStaff`, `bulkCartUpdate`, etc. Every write returns a Promise and can be rejected by host business rules ("Throws an error if POS fails to add the line item due to validation or system errors"). A `Cart.editable?: boolean` flag gates the whole surface, with a tolerant-reader default: "An `undefined` value should be treated as `true` for backward compatibility." The UI-less background target gets the signal but not the methods: "Mutation methods from the full Cart API aren't available in app background extensions." ([Cart API](https://shopify.dev/docs/api/pos-ui-extensions/latest/apis/cart-api))

Data reaches the extension through a `shopify` global scoped per target (`shopify.storage`, `shopify.toast`, `shopify.action.presentModal()`), declared to linters as a readonly global.

### 2.2 Remote DOM: the element *is* the contract

Remote DOM makes the per-component contract explicit and declarative. A `RemoteElement` subclass declares `remoteProperties` (an allowlist: "Remote DOM converts an allowlist of element instance properties into a dedicated object that can be communicated to the host environment"), `remoteEvents` (host → remote, delivered as a `CustomEvent` subclass with the host's argument on `detail`), and `remoteMethods` (host-callable). `createRemoteElement<Props, Methods>({properties, attributes, events, methods})` gives the same thing with TypeScript generics. Hosts constrain what may be drawn by "providing an allowlist of custom elements that the remote environment can render." ([`@remote-dom/core` README](https://github.com/Shopify/remote-dom/blob/main/packages/core/README.md), [repo README](https://github.com/Shopify/remote-dom))

Functions do not cross by themselves: mutations travel over `postMessage`, so "we need a library that can serialize functions over `postMessage`" — `@quilted/threads`, with `retain`/`release` passed to the receiver for manual memory management of proxied functions.

### 2.3 React Server Components: the strictest published props contract

RSC gives a hard, enumerated serialization rule that is worth adopting as a *discipline* even with no server involved. Serializable: primitives (incl. `bigint`, `undefined`, `null`, globally-registered symbols), `String`/`Array`/`Map`/`Set`/`TypedArray`/`ArrayBuffer`, `Date`, plain objects with serializable properties, **Server Functions**, React elements (JSX), and Promises. Not supported: "Functions that are not exported from client-marked modules or marked with `'use server'`", **classes**, "Objects that are instances of any class (other than the built-ins mentioned) or objects with a null prototype", and non-global symbols. Violations "will throw an exception." ([`'use client'`](https://react.dev/reference/rsc/use-client))

That list is the single best test for "will this props contract survive being moved across a process boundary later."

### 2.4 Module Federation's shared-module contract

MF's contract is versions, not data: `shared` entries with `singleton`/`eager`/version constraints, plus Re.Pack's mandatory `react`/`react-native` singletons and RN deep-import sharing (§1.3). It answers "can these two bundles coexist," never "what may this bundle read or write." Any MF-based future still needs a Shopify-style data/API contract on top.

---

## 3. Delivery: build-time vs runtime

### 3.1 Expo React Server Components — not ready (Sept 2026)

The Expo docs (page `modificationDate: July 29, 2026`) label RSC "Experimentally available. This is a beta release and subject to breaking changes" and "a very early technical preview that we're actively developing." Enabled by `experiments.reactServerFunctions` (plus `reactServerComponentRoutes` for full mode, which has "no Stack/Tabs/Drawer support and most `Link` props unsupported"); requires the New Architecture and Expo Router; `web.output` must be `single`. Verbatim blockers: "Production deployment is limited and not recommended yet"; "EAS Update does not work with Server Components yet"; "Server rendering RSC payloads to HTML is not supported yet"; "DOM components can't use Server Functions in production"; `StyleSheet.create` and `Platform.OS` don't work on native; "Server Functions calling other Server Functions fail on Hermes." Offline is explicitly *future* work — build-time rendering is expected to "enable build-time rendering to provide better offline support." ([Server Components](https://docs.expo.dev/guides/server-components/))

### 3.2 Expo DOM components (`'use dom'`) — a WebView with a JSON bridge

At build time the module "is replaced with a proxy reference imported at runtime," and on native it renders in a WebView (`@expo/dom-webview` by default from SDK 56; `react-native-webview` before that). Props must be `number | string | boolean | null | undefined | Array | Object`, travel over "an async JSON bridge," and updates "re-render the entire React tree." Async functions passed as **top-level** props become native actions — "You cannot pass functions as nested props," arguments must be serializable, calls are always async. Limitations quoted: no `children`; "Instances are standalone and don't share data"; "Native views can't be placed inside DOM components"; "Embedded only — no OTA updates"; sync router hooks unsupported; "Plain JS is slower to start than Hermes bytecode." On web the `dom` prop is ignored and it behaves as an ordinary React component. ([DOM components](https://docs.expo.dev/guides/dom-components/)) **Unverified:** Electron is not mentioned anywhere in that page; behaviour under the Electron target is unknown.

### 3.3 EAS Update

Ships "non-native pieces (such as JS, styling, and images) over-the-air"; cannot ship native code, native deps, permission changes, or SDK upgrades — "Anything that requires a new app binary version." Compatibility is enforced by runtime versions. On store policy Expo declines to interpret: "you need to follow the rules of the platforms and app stores you are building for… This usually means changes to your app's behavior need to be reviewed." ([EAS Update](https://docs.expo.dev/eas-update/introduction/))

### 3.4 App-store ceiling on downloaded code

- **Apple.** There is **no guideline 3.3.2 in the current App Review Guidelines** — that clause lives in the Developer Program License Agreement, a separate document not surveyed here. The reviewable rule is **2.5.2**, quoted verbatim: "Apps should be self-contained in their bundles, and may not read or write data outside the designated container area, nor may they download, install, or execute code which introduces or changes features or functionality of the app, including other apps." The relevant carve-out is **4.7**, which permits apps to offer "HTML5 and JavaScript mini apps and mini games, streaming games, chatbots, and plug-ins," subject to 4.7.1–4.7.5 including no exposing native APIs to third parties without Apple's permission. ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))
- **Google.** An app "may not modify, replace, or update itself using any method other than Google Play's update mechanism," and may not fetch executable code (dex/JAR/.so) from elsewhere — but "This restriction does not apply to code that runs in a virtual machine or an interpreter where either provides indirect access to Android APIs," citing JavaScript in a webview. Interpreted code loaded at runtime "must not allow potential violations of Google Play policies." ([Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379))

**Read-through:** third-party JS in a sandbox is the *only* lane that is defensible on both stores, and on iOS it lands squarely in 4.7's "plug-ins" carve-out with its own review obligations. Shipping third-party JS that "changes features or functionality" outside a sandbox is the thing 2.5.2 prohibits.

### 3.5 Delivery options, scored

| Option | Offline cost | Store cost | Maturity (Sept 2026) |
| --- | --- | --- | --- |
| In-bundle static registry | none — ships in the binary/bundle | none | mature; what Bluesky/Expensify/Mattermost do |
| EAS Update (JS only) | update fetch needs network; last good update runs offline | Expo defers to store rules; JS-only, review still applies to behaviour change | mature |
| Expo DOM components | embedded only, "no OTA updates"; WebView start cost | none (bundled) | shipped, SDK 56 default WebView; heavy constraints |
| Expo RSC | needs a server at request time; offline is future work | not discussed by Expo; RSC + EAS Update unsupported | **beta, "not recommended yet"** |
| Re.Pack + MF2 remotes | remote container fetched at runtime; needs caching to work offline | Apple 2.5.2 vs 4.7; Google's interpreter exception covers JS | production-used by Callstack; version management "cumbersome" |
| Remote DOM in worker/iframe | code still has to arrive from somewhere | strongest 4.7 story (sandboxed plug-in) | Shopify runs it in prod (POS + checkout) |

**Unverified:** QuickJS or Hermes-based sandbox runtimes for untrusted JS inside RN. No primary source found in this survey; Shopify's published isolation is Web Worker / `<iframe>`, both web-platform primitives, not RN ones. Do not assume an RN-native sandbox exists.

---

## 4. Sandboxing and trust

Shopify's checkout UI extensions are the only surveyed system with an explicit, published isolation contract. Extensions "run in an isolated sandbox, separate from the checkout page and other UI extensions," "don't have access to sensitive payment information or the checkout page itself (HTML or other assets)," and "run inside of a Web Worker which doesn't have access to `window` or the DOM" — error handlers must attach to `self`, not `window`. They "have limited access to global web APIs" and are "limited to specific UI components and APIs that are exposed by the platform," reached through the `shopify` global. Network is a declared capability: `network_access` "Allows your extension to make external network calls," and it is required even to ship errors to a third-party service; `api_access` gates the Storefront API; protected customer data requires application and review. ([Checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions))

What Remote DOM itself guarantees is narrower than people assume. Its own framing: it lets you "isolate potentially-untrusted code off the main thread, but still allow that code to render a controlled set of UI elements to the main page." The library supplies the *mirroring* and the *element allowlist*; the actual isolation is whatever you put the remote code in (a hidden `<iframe>`, or a Web Worker with `@remote-dom/core/polyfill`). It provides no capability model, no network gating, and no CPU/memory limits — Shopify layers those on top in the platform. Note also the memory contract: because functions are proxied over RPC, hosts must pass `retain`/`release` or leak.

For POS specifically, Shopify's own docs describe remote-dom + the component allowlist but do **not** state a worker sandbox for POS extensions; the worker statement is documented for *checkout*. Treat "POS extensions run in a worker" as inferred, not asserted.

---

## 5. Versioning and regrets

**Shopify rewrote remote-ui into Remote DOM, and said why.** Verbatim from the migration guide: "Remote DOM started out with as a project called `remote-ui`. The original packages had a DOM-like API, but because they did not use the DOM directly, it was difficult to use them with any JavaScript library other than React. Remote DOM is a complete rewrite of `remote-ui` that uses the DOM directly, which makes for more seamless use of browser-friendly libraries, and a simpler learning code for developers who already have familiarity with the DOM." ([migrating-from-remote-ui](https://github.com/Shopify/remote-dom/blob/main/documentation/migrations/remote-ui-to-remote-dom.md)) The concrete regret is the **bespoke component model**: `RemoteRoot.createComponent()` with string names was replaced by real custom elements (`class Button extends RemoteElement` + `customElements.define('ui-button', Button)`), and `@remote-ui/traversal` was deleted because "The tree traversal utilities provided by this library are all supported natively by the DOM." Also deleted for being self-inflicted: `@remote-ui/mini-react` ("an adapted version of Preact… you can use Preact directly instead") and `@remote-ui/vue` ("This library was always poorly maintained"). The repo itself was renamed — `github.com/Shopify/remote-ui` now redirects to `Shopify/remote-dom` (confirmed via `gh api repos/Shopify/remote-ui` → `full_name: Shopify/remote-dom`, `created_at: 2020-06-17`).

**Lesson:** inventing your own component/registration vocabulary when a platform vocabulary already exists cost Shopify a full rewrite of a production extension platform.

**React Native's migration.** The team frames the New Architecture as a deliberate ground-up rewrite — "the result of a ground-up rewrite of React Native we've been working on since 2018" — and is explicit that the compatibility shim is temporary: "The bridge remains for backward compatibility to support gradual migration… In the future, we will remove the bridge code completely," and "In a future release, we will remove the interop layer and modules will need to support the New Architecture." They also name what interop costs you: "Without migrating your custom Native Modules, you will not get the benefits of shared C++, synchronous method calls, or type-safety from codegen. Without migrating your Native Components, you will not be able to use concurrent features." ([The New Architecture is here](https://reactnative.dev/blog/2024/10/23/the-new-architecture-is-here)) There is no "lessons learned" section; the nearest thing is the acknowledgement of partners "for pioneering the adoption… and reporting various issues so that we could fix them for everyone else."

**Shopify's versioning machinery** (from the prior-art survey, re-confirmed here): quarterly dated `api_version` pinned per extension in the TOML, with the platform refusing to run fossils.

**Meta at scale.** Meta's published position is not "one codebase everywhere": "we're not chasing 'write once, run anywhere'… we should still be developing discrete apps for each platform, but the same set of engineers should be able to build applications for whatever platform they choose" ([React Native: Bringing modern web techniques to mobile](https://engineering.fb.com/2015/03/26/android/react-native-bringing-modern-web-techniques-to-mobile/)). Notably, the Messenger *mobile* rewrite (Project LightSpeed) went **native**, not RN, cutting "core Messenger code by 84 percent, from more than 1.7M lines to 360,000" ([Project LightSpeed](https://engineering.fb.com/2020/03/02/data-infrastructure/messenger/)); RN's Messenger win was on **desktop**, replacing Electron, in partnership with Microsoft, and they had to build their own multi-window handling and auto-update because RN Desktop shipped neither ([Messenger Desktop](https://developers.facebook.com/blog/post/2023/05/17/messenger-desktop-faster-and-smaller-by-moving-to-react-native-from-electron/)).

---

## 6. Recommendation for the wcpos v1 slot primitive

### 6.1 Registration shape: a static, typed, module-level registry — not React-tree registration

Register with a name key into a module-level map at import time, mirroring `TurboModuleRegistry`'s two-layer split: a cheap **descriptor** (id, slot name, default order, title/icon, capability flags) that can be enumerated, ordered and persisted without mounting anything, plus a **lazy component reference** resolved only when the slot renders. React's own advice points the same way — the `Children` API "does not include rendered output," so anything that discovers or orders entries by walking the tree is structurally unable to see what it needs.

Reject React-tree registration (children mounting into a portal target and announcing themselves via context) for three concrete reasons: (a) ordering becomes mount-order-dependent and therefore racy under Suspense/concurrent rendering; (b) the per-till override UI needs the full candidate list *before* first paint, which tree registration cannot provide; (c) it forces every future third-party entry to live inside the host's provider tree, foreclosing a sandboxed boundary later.

Reject a manifest file for v1 — it is Shopify's shape and it is the right *end state*, but a manifest with one consumer is ceremony. Keep the registry's descriptor object **manifest-shaped** (a plain, serializable record: `{ id, target, order, title, capabilities }`) so a TOML/JSON manifest can later be parsed straight into it.

Name it something other than `Slot`: Expo Router already owns `<Slot />` as "a placeholder for the current child route." `SlotRegistry` / `registerPanel` / `extensionPoint` — anything unambiguous.

### 6.2 Target naming

Adopt Shopify's dotted, screen-scoped, closed vocabulary now, while there are two consumers: `pos.columns.panel`, `pos.products.filter-bar.item`. Closed lists are cheap to deprecate; open ones are forever.

### 6.3 Props contract: readonly data in, enumerated async methods out

Copy the Cart API shape literally:

- **In**: a per-target context object with a readonly, subscribable current value — `{ value: Readonly<T>; subscribe(fn): () => void }`. For the filter bar that is the product query state; for a column panel it is the till/layout context. Never hand out an RxDB collection, document, or query object: those are **class instances**, which RSC's rule excludes outright ("Objects that are instances of any class… " are not serializable), which means they can never cross a worker boundary and will silently paint out the third-party future.
- **Out**: a fixed, named method list returning `Promise<void>` (or a Promise of an id), each free to reject on host business rules. `setFilter(...)`, `clearFilter(...)` for the filter bar. Add an `editable`-style guard for anything that mutates cart/order state, with the tolerant-reader default Shopify uses (`undefined` means allowed).
- **Type it** as a map interface keyed by target name (`interface SlotTargets { 'pos.columns.panel': { data: ...; api: ... } }`), so `register('pos.columns.panel', …)` infers its own contract from the key — the TurboModule spec-per-module idea expressed in TypeScript, and open to declaration merging when extension packages arrive.
- **Discipline**: hold every slot prop to the RSC serializable list ([`'use client'`](https://react.dev/reference/rsc/use-client)) plus registry-provided function props. That single rule is what makes a later move to Remote-DOM-in-a-worker a refactor rather than a rewrite.

### 6.4 Ordering and per-till overrides

The registry descriptor carries a default order. The per-till setting persists an **array of entry ids**; render order is `savedOrder.filter(id => registry.has(id))` followed by registered-but-unlisted entries in default order. Tolerate unknown ids silently (an entry may be gone, or from a not-yet-installed extension) — the open-enum/tolerant-reader stance. This is React's prescribed "accept an array of objects as a prop" pattern, and it makes the products-left / cart-left toggle a two-element reorder rather than a special case.

### 6.5 Delivery for v1: in-bundle first party only

**All slot content ships in the bundle as ordinary React Native components. No RSC, no DOM components, for the September 2026 release or the one after.**

- **Expo RSC is disqualified on its own docs**: "Production deployment is limited and not recommended yet," "EAS Update does not work with Server Components yet," and offline support is future work. wcpos is offline-first; a POS cart panel that needs a request-time server round trip is not shippable.
- **DOM components are disqualified for slot content**: WebView-hosted, "no `children`," "Native views can't be placed inside DOM components," props marshalled over an async JSON bridge that "re-render[s] the entire React tree," "Embedded only — no OTA updates," and slower start than Hermes bytecode. The cart and product panels are the app's hottest UI and must host native views. Electron behaviour is undocumented. Revisit only for a genuinely isolated, low-frequency surface (a third-party settings pane), never for the columns slot.
- EAS Update remains the delivery channel for the whole bundle, unchanged.

### 6.6 What to keep open for third parties

Everything above is chosen so the third-party step is additive: closed dotted target names; serializable readonly data; enumerated async writes; a serializable descriptor that a manifest can produce; a capability flag on the descriptor so hardware (print, scan, drawer) is a declared grant rather than an import. When third parties arrive, the plausible lane is Remote DOM in a worker/iframe behind an element allowlist, delivered either in-bundle-per-tenant or via Re.Pack MF2 remotes — and Apple 4.7's "plug-ins" carve-out plus Google's interpreter exception both point at *sandboxed* JS as the only defensible shape.

### 6.7 Things that would paint out the third-party future — do not do these

1. Putting RxDB collections/documents/queries, or any class instance, into slot props (unserializable → unsandboxable).
2. Letting slot content import app internals or render arbitrary host components instead of a declared vocabulary. Shopify pays a 64 KB budget and a component allowlist for exactly this.
3. Registering by React tree, or ordering by mount order.
4. Returning mutable state objects or a store handle from the slot API instead of `{ value, subscribe }` + methods.
5. Giving slot content direct hardware access (printer/scanner/drawer) rather than host-mediated capability methods.
6. Inventing a bespoke component/registration vocabulary where a platform one exists — the literal cause of Shopify's remote-ui → Remote DOM rewrite.
7. Shipping the v1 target names as an open, user-extensible string space with no `api_version` field on the descriptor.

### 6.8 One line

Build a static, typed, name-keyed registry of manifest-shaped descriptors with lazy component refs; hand each target a `{ value, subscribe }` readonly view plus an enumerated list of async, rejectable write methods; order from a persisted per-till id array with tolerant-reader semantics; ship it all in-bundle — no RSC, no DOM components — and hold every prop to the RSC serializable list so the day third-party code needs a worker, the contract does not have to change.

---

## Sources

- React: [Composition vs Inheritance](https://legacy.reactjs.org/docs/composition-vs-inheritance.html) · [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) · [`Children`](https://react.dev/reference/react/Children) · [`createPortal`](https://react.dev/reference/react-dom/createPortal) · [`use`](https://react.dev/reference/react/use) · [`'use client'`](https://react.dev/reference/rsc/use-client)
- React Native: [Turbo Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction) · [New Architecture landing page](https://reactnative.dev/architecture/landing-page) · [The New Architecture is here](https://reactnative.dev/blog/2024/10/23/the-new-architecture-is-here)
- Callstack Re.Pack: [Microfrontends](https://re-pack.dev/docs/getting-started/microfrontends) · [ModuleFederationV2Plugin](https://re-pack.dev/api/plugins/module-federation-v2) · [v4 Module Federation](https://v4.re-pack.dev/docs/module-federation)
- Shopify: [remote-dom README](https://github.com/Shopify/remote-dom) · [`@remote-dom/core` README](https://github.com/Shopify/remote-dom/blob/main/packages/core/README.md) · [migrating-from-remote-ui](https://github.com/Shopify/remote-dom/blob/main/documentation/migrations/remote-ui-to-remote-dom.md) · [POS UI extensions](https://shopify.dev/docs/api/pos-ui-extensions) · [Targets](https://shopify.dev/docs/api/pos-ui-extensions/latest/targets) · [Cart API](https://shopify.dev/docs/api/pos-ui-extensions/latest/apis/cart-api) · [Checkout UI extensions](https://shopify.dev/docs/api/checkout-ui-extensions)
- Expo: [Router introduction](https://docs.expo.dev/router/introduction/) · [Layouts / `<Slot />`](https://docs.expo.dev/router/basics/layout/) · [Server Components](https://docs.expo.dev/guides/server-components/) · [DOM components](https://docs.expo.dev/guides/dom-components/) · [EAS Update](https://docs.expo.dev/eas-update/introduction/)
- Stores: [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (2.5.2, 4.7) · [Google Play Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379)
- Meta: [React Native: Bringing modern web techniques to mobile](https://engineering.fb.com/2015/03/26/android/react-native-bringing-modern-web-techniques-to-mobile/) · [Project LightSpeed](https://engineering.fb.com/2020/03/02/data-infrastructure/messenger/) · [Messenger Desktop on React Native](https://developers.facebook.com/blog/post/2023/05/17/messenger-desktop-faster-and-smaller-by-moving-to-react-native-from-electron/)
- OSS RN apps, read via the GitHub contents API on 2026-09-02: [`bluesky-social/social-app` `src/`](https://github.com/bluesky-social/social-app/tree/main/src) and `src/App.tsx` · [`Expensify/App` `src/`](https://github.com/Expensify/App/tree/main/src) · [`mattermost/mattermost-mobile` `app/products/`](https://github.com/mattermost/mattermost-mobile/tree/main/app/products) and `tsconfig.json` path aliases
