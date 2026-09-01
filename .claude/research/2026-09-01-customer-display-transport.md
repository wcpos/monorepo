# Customer-Display Transport and Pairing Landscape

- **Date:** 2026-09-01
- **Ticket:** [wcpos/roadmap#122](https://github.com/wcpos/roadmap/issues/122) (wayfinder map [#120](https://github.com/wcpos/roadmap/issues/120), "App extensibility")
- **Question:** What are the viable transports and pairing models for a live customer-facing
  display, across (a) an Electron second window, (b) a browser page on another LAN device,
  (c) an eventual standalone display app? Hard constraint: the POS must keep working
  offline/LAN-only.

## TL;DR

The display problem splits cleanly into **transport** (how order state reaches the display) and
**pairing** (how the display finds the POS the first time). For v1 (Electron second window +
LAN browser page) the answer is: **no network transport at all for the second window** (Electron
IPC between two BrowserWindows), and a **POS-hosted local HTTP + WebSocket server in the Electron
main process** for the LAN page, paired by **QR code encoding `http://<ip>:<port>/#<token>`**
(mDNS optional garnish, not the primary path). This is exactly the Loyverse/Shopify model, it
works fully offline, and it reuses infrastructure the app already has (Node in Electron main,
`bonjour-service` already a main-process dependency, `react-native-tcp-socket` already linked
for native). Cloud relay (Novu) and WordPress relay both fail the offline constraint as primary
transports; either can later serve as an *optional signaling/fallback* channel. The design that
keeps the standalone-app future open is a small transport-agnostic protocol (versioned JSON
messages: `cart.updated`, `payment.started`, `display.config`, …) with pluggable transports
underneath — IPC today, WS tomorrow, WebRTC data channel only if the web-platform POS ever needs
to host a display itself.

## Local facts (monorepo, read 2026-09-01)

- App is Expo SDK 57 / RN 0.86, platforms: `apps/main` (iOS/Android/web via expo),
  `apps/electron` (submodule [wcpos/electron](https://github.com/wcpos/electron), Electron Forge
  + webpack, serves the expo web export via `electron-serve`), `apps/web` (web-bundle submodule).
- **`react-native-tcp-socket` ^6.4.2 is already a dependency** of `apps/main` and a peer dep of
  `@wcpos/printer` (`packages/printer/src/transport/network-adapter.ts` uses it as a raw TCP
  *client* for :9100 printing). So the native TCP module is linked and excluded from
  expo-doctor's directory check already.
- **Electron main process already runs mDNS**: `bonjour-service` 1.4.4 is a dependency of
  `@wcpos/app-electron`, used by `src/main/printer-discovery.ts`. Electron main also already
  hosts an IPC HTTP bridge (`src/main/http-bridge.ts`, renderer axios-shaped configs over
  `net.fetch`) — precedent for main-process services fronted by IPC.
- **Novu**: `packages/core/src/services/novu/client.ts` runs a `@novu/js` v3 client against a
  self-hosted instance (`api.notifications.wcpos.com` / `wss://ws.notifications.wcpos.com`).
  It is a per-subscriber notification inbox (socket.io under the hood), not a general pub/sub —
  and note the file's own warning that notifications sent before the socket connects are missed.
- `packages/virtual-printer` (dev tool) already advertises mDNS services and runs HTTP + raw TCP
  servers on the LAN for printer testing — the team has working knowledge of the whole
  mDNS/LAN-server/Chromium-LNA problem space from printing.
- Also linked: `react-native-ble-plx` (BLE central; not useful for a display transport) and
  `@react-native-community/netinfo` (useful for detecting LAN/IP changes).
- Web platform POS already fights Chromium **Local Network Access** (LNA) prompts for printers
  (see `packages/virtual-printer/README.md`) — the same constraint applies to any
  browser-POS → LAN-display connection.

## 1. Local transports: POS-hosted server

### Per-platform ability to HOST a server

| POS platform | Raw TCP server | HTTP server | WebSocket server | Notes |
|---|---|---|---|---|
| Electron (main proc) | ✅ Node `net` | ✅ Node `http` | ✅ `ws` (full Node) | Trivial; already runs main-process services (`printer-discovery`, `http-bridge`) |
| iOS native | ✅ `react-native-tcp-socket` `createServer()` (already linked) | ⚠️ build on TCP, or [`expo-http-server`](https://github.com/simonsturge/expo-http-server) (Criollo/AndroidServer) | ⚠️ no maintained turnkey lib — RFC 6455 framing over tcp-socket (handshake + framing is small, well-specified), or embed nodejs-mobile (heavy) | Server paused when app backgrounded |
| Android native | ✅ same | ✅ same | ⚠️ same | Foreground service can keep it alive |
| Web (browser POS) | ❌ | ❌ | ❌ | Browsers cannot listen on sockets, full stop. Only WebRTC (with signaling) or a relay |

Key facts:

- `react-native-tcp-socket` ([Rapsssito/react-native-tcp-socket](https://github.com/Rapsssito/react-native-tcp-socket))
  imitates Node's `net` API including `createServer()` and TLS servers, iOS/Android/macOS. RN's
  built-in `WebSocket` is **client-only**; there is no maintained on-device WS *server* module
  (the one npm package, `react-native-websocket-server`, is abandoned/legacy-link era). Hosting
  a WS server on native means writing the RFC 6455 handshake + frame codec over tcp-socket
  (~200 lines, no extensions needed for a single trusted LAN client) — feasible, but v1 doesn't
  need it because v1's hosts are Electron (Node) and the display *clients* are browsers.
- The display **client** side is easy everywhere: browsers, RN, and Electron all have WebSocket
  clients built in.
- Android cleartext: HTTP (not HTTPS) to a LAN IP requires `usesCleartextTraffic` / network
  security config on the *display* app if it's Android-native; browser clients don't care
  (plain `http://192.168.x.x` pages are fine, but see LNA below if the *POS* is a browser).
- TLS on a LAN server is effectively not worth it for v1: no CA will issue certs for private
  IPs; self-signed certs produce browser interstitials on the display device. Ship plain HTTP
  on the LAN with a pairing token (the cart contents are being shown to the customer anyway);
  revisit if payment interactions ever ride this channel.

### Discovery & pairing

- **QR pairing is the industry default and the robust path**: POS shows a QR encoding
  `http://<lan-ip>:<port>/display#<one-time token>`; any tablet/TV browser scans (or the URL is
  typed once) and the page connects over WS. No multicast involved — survives AP client
  isolation, VLANs, and iOS entitlement hurdles. Token establishes the pairing; server persists
  the display registration so reconnects are automatic (Shopify's exact model).
- **mDNS** (`_wcpos-display._tcp` or similar) is a *convenience layer* for the future standalone
  display app ("displays found on your network: …", Loyverse's model). Constraints:
  - **iOS 14+**: any local-network traffic triggers the Local Network privacy prompt;
    `NSLocalNetworkUsageDescription` required, plus `NSBonjourServices` listing each browsed
    service type. Browsing via the OS APIs (`NWBrowser`/`NSNetServiceBrowser`, which
    `react-native-zeroconf` uses) does **not** need the restricted
    `com.apple.developer.networking.multicast` entitlement — that entitlement (granted
    case-by-case by Apple) is only needed for raw-socket multicast (custom mDNS stacks,
    broadcast). Stick to OS Bonjour APIs and the entitlement is avoided.
    Sources: [Apple: How to use multicast networking](https://developer.apple.com/news/?id=0oi77447),
    [Local Network Privacy FAQ](https://developer.apple.com/forums/thread/663875),
    [WWDC20 10110](https://developer.apple.com/videos/play/wwdc2020/10110/).
  - **Android**: `NsdManager` needs `INTERNET`/`ACCESS_WIFI_STATE` (+
    `CHANGE_WIFI_MULTICAST_STATE` and a `MulticastLock` only for raw-socket mDNS libs);
    long-documented NSD flakiness (ghost `onServiceLost`, empty TXT records on old APIs).
    **Android 16 introduces a runtime local-network permission** covering NsdManager and all
    `.local` traffic — another prompt to handle
    ([Android local network permission](https://developer.android.com/privacy-and-security/local-network-permission)).
  - RN libs: [`react-native-zeroconf`](https://github.com/balthazar/react-native-zeroconf)
    (publish + browse, no official Expo config plugin, community recipe exists) or the newer
    Nitro-based [`@dawidzawada/bonjour-zeroconf`](https://github.com/dawidzawada/bonjour-zeroconf)
    (Expo-friendly, plugin "coming soon"). Electron side needs neither — `bonjour-service` is
    already there.
  - mDNS **fails on exactly the networks small merchants have**: guest SSIDs with client
    isolation, mesh APs that eat multicast, 2.4/5GHz band separation. This is why every
    incumbent that uses discovery also exposes manual-IP entry (Loyverse) or QR (Shopify).
- **Backgrounding**: iOS suspends the app → server and sockets die; an iOS-native POS hosting
  the display server only works as a foreground/kiosk (Guided Access) device
  ([expo-http-server README notes the same](https://github.com/simonsturge/expo-http-server)).
  Android can hold a foreground service. Electron has no such problem. Shopify documents the
  identical limitation: "both apps must be running in the foreground" to keep Customer View
  connected. For v1 (Electron host) this is a non-issue; for the future iPad-POS-hosts-display
  case, plan on "POS in foreground" being a documented requirement, as it is for every
  competitor.

## 2. WebRTC

- **Someone must run signaling** — a WebRTC connection cannot begin without an out-of-band
  channel to exchange SDP/ICE. Options: the POS's own LAN server (circular — if you have that,
  you don't need WebRTC), the WordPress site (REST polling as a signaling mailbox — viable,
  ~seconds latency, fine for a one-time handshake), or a cloud service (fails offline).
- On the **same LAN without STUN/TURN**, browsers connect using host candidates; since ~2019
  those are obfuscated as ephemeral **mDNS `.local` candidates** for data-channel-only pages,
  which resolve over multicast — so WebRTC-on-LAN inherits the *same* multicast fragility as
  mDNS discovery (client isolation, multi-subnet, some AP configs), with documented
  interop bugs (e.g. [Firefox↔Chrome same-LAN failure](https://bugzilla.mozilla.org/show_bug.cgi?id=1698141));
  Chrome even disables mDNS obfuscation on enterprise networks because of it
  ([details](https://bloggeek.me/webrtcglossary/mdns/), [IETF draft](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates-04)).
- **What a data channel buys over a plain socket here: almost nothing** — same-LAN, one
  hop, tiny JSON payloads; NAT traversal and P2P encryption solve problems this topology
  doesn't have. RN needs `react-native-webrtc` (a heavyweight native dep) to participate.
- **The one real use case**: the **web-platform POS**, which cannot host any server. A
  browser POS could reach a LAN display browser page P2P via WebRTC with only lightweight
  signaling through the WordPress site, keeping live traffic on the LAN. That's the escape
  hatch for "browser POS + LAN display, offline-ish" — keep it in the back pocket, don't build
  it for v1.
- Note the browser-POS case also trips Chromium **Local Network Access** restrictions
  (public-HTTPS page → private-IP fetch/WS), already familiar from web printing. WebRTC
  sidesteps LNA; direct WS from an HTTPS POS page to `ws://192.168.x.x` does not (mixed
  content + LNA prompt).

## 3. Cloud relay (Novu / hosted pub/sub)

- The existing Novu client is a **notification inbox**, not a display bus: per-subscriber
  persistent notifications, unread counts, socket.io transport to
  `wss://ws.notifications.wcpos.com`. Repurposing it for cart-line-by-cart-line streaming would
  mean creating a subscriber per display, sending a workflow trigger per keystroke through the
  self-hosted Novu API, and paying the documented race (events sent before socket connect are
  dropped — see the warning block in `client.ts`). Wrong tool.
- A proper hosted pub/sub (Ably/Pusher/Supabase Realtime, or a small self-hosted socket.io
  room server next to Novu) is *mechanically* the easiest cross-network transport — no
  discovery, no LNA, works when POS and display are on different networks — with typical
  100–300 ms latency. But:
  - **Fails the hard offline/LAN-only constraint outright.** Internet down → display frozen.
  - Ongoing infra cost and fan-out scaling on wcpos's side for a feature competitors deliver
    with zero cloud traffic.
  - Every cart update transits the internet — merchants notice both the lag and the privacy
    smell.
- Verdict: never the primary transport. Acceptable later as (a) signaling for WebRTC, or
  (b) an explicit "remote display" mode (display in a different location), which is a
  different feature.

## 4. WordPress relay

- The POS already syncs to the merchant's WP site via REST, and Electron main proxies HTTP —
  but WP is the **worst** real-time substrate available: typical shared PHP hosting cannot hold
  WebSocket daemons (managed WP hosts like Kinsta/WP Engine explicitly don't provide WS
  servers), SSE ties up a PHP-FPM worker per display and gets killed by proxies/timeouts, and
  the realistic mechanism is REST/Heartbeat-style polling at 5–15 s intervals
  ([Heartbeat API](https://developer.wordpress.org/plugins/javascript/heartbeat-api/),
  [WP + WebSockets state of play](https://belovdigital.agency/blog/implementing-websockets-in-wordpress/)).
- 5–15 s latency is unusable for a live cart display, it loads the merchant's server per
  display per tick, and it fails offline (site unreachable ⇒ display dead — the exact scenario
  the offline-first sync architecture exists to survive).
- Legitimate supporting roles only: pairing bootstrap ("this store's displays" registry),
  WebRTC signaling mailbox for the browser-POS case, display config storage.

## 5. Offline/LAN-only constraint (the filter)

| Transport | Works with internet down? |
|---|---|
| Electron second window (IPC) | ✅ works with *everything* down |
| POS-hosted LAN server (WS) | ✅ needs only a local link (even a phone-hotspot or router with no WAN) |
| WebRTC on LAN | ✅ once signaled; ❌ if signaling is cloud/WP and pairing hasn't happened yet |
| Cloud relay | ❌ |
| WordPress relay | ❌ |

The constraint eliminates 3 and 4 as primary transports before any other criterion is applied.
Loyverse advertises exactly this property ("Customer Display works offline as long as both are
on the same Wi-Fi") — it's a selling point, not just an implementation detail.

## 6. Incumbent mechanics (primary sources)

| Vendor | Topology | Transport | Pairing UX | Source |
|---|---|---|---|---|
| **Square Register** | Dedicated hardware second screen | **Wired**: docked connector or micro-USB tether (40" max); no wireless option | None — physical docking | [Square: set up Register](https://squareup.com/help/us/en/article/8597-set-up-square-register-2nd-generation), [display troubleshooting](https://squareup.com/help/us/en/article/8467-troubleshoot-square-register-customer-display) |
| **Square Stand/POS app** | No second-device display | n/a (Stand 2 has a small built-in customer-facing strip; an old iPad "customer display" beta over Wi-Fi was killed) | n/a | [Square community threads](https://community.squareup.com/t5/Questions-How-To/Square-Register-Customer-Display-Options/td-p/113933) |
| **Shopify POS** | Second device: Android-only "Customer View" app; POS on iOS or Android | **Same LAN** (Wi-Fi/Ethernet, same SSID); persistent local connection; both apps must stay foreground; cannot switch Wi-Fi↔Ethernet without re-pairing | **QR code scan** from POS "Set up hardware" flow; pairing persists | [Shopify Help: Customer View app](https://help.shopify.com/en/manual/sell-in-person/hardware/customer-view-app) |
| **Loyverse** | Second device: CDS app (iOS/Android) | **Same LAN**; POS connects to the CDS device's IP (CDS acts as the discoverable endpoint); **works offline** on local Wi-Fi | Network **search/discovery from POS**, or **manual IP entry** (IP shown on CDS welcome screen); confirm "Pair" on the display | [Loyverse CDS guide](https://help.loyverse.com/help/customer-display-system), [how CDS works](https://help.loyverse.com/help/how-customer-display-works) |
| **Odoo POS** | Four modes | (1) Second monitor on same machine — POS opens a **browser window you drag** to the screen; (2) "Remote display" — any device on the **same LAN** opens a customer-display URL served by the Odoo server; (3) IoT Box drives an HDMI screen; (4) dual-screen Android terminals | Mode 2 is just "open this URL from the POS card menu" — server-mediated, no discovery | [Odoo 18 customer display docs](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/shop/customer_display.html) |

Patterns worth copying: **same-LAN + QR** (Shopify) is the lowest-friction pairing;
**manual IP as the discovery fallback** (Loyverse) rescues hostile networks; **"drag this
window to the second screen"** (Odoo local mode) is the correct same-device UX; everyone
accepts and documents the foreground-app limitation. Square's answer (wire it) is the
reliability gold standard but requires owning hardware — not our lane.

## 7. Comparison table

Criteria: v1 fit = Electron second window + LAN browser page; future = standalone display app.

| Option | Offline | Latency | Effort (v1) | Pairing UX | Web-POS support | Standalone-app future | Verdict |
|---|---|---|---|---|---|---|---|
| **A. Electron IPC second window** | ✅ | ~0 ms | **Low** (new BrowserWindow + IPC channel; expo web export already served by electron-serve) | none needed | n/a | n/a (same-device only) | **Do first** |
| **B. Electron-main HTTP+WS server on LAN, QR pairing** | ✅ | <10 ms LAN | **Low-medium** (Node `http`+`ws` in main; static display page; token pairing; optional `bonjour-service` advertise — dep already present) | QR / typed URL; auto-reconnect via stored token | ❌ (browser POS can't reach it — server lives in Electron) | ✅ same protocol, display app is just a native WS client | **Do second — the v1 LAN answer** |
| **C. Native-POS-hosted server (tcp-socket + WS framing)** | ✅ | <10 ms | Medium (hand-rolled RFC 6455 server; iOS local-network prompt; foreground-only on iOS) | same QR model | ❌ | ✅ | Defer — needed only when iPad/Android POS must host a display without Electron |
| **D. WebRTC data channel (WP-signaled)** | ⚠️ LAN-P2P after signaling; pairing needs the site | <10 ms | High (react-native-webrtc, signaling plumbing, mDNS-candidate flakiness) | QR → signaling exchange | ✅ (the only LAN option for browser POS) | ✅ | Back pocket for browser-POS; not v1 |
| **E. Cloud relay (Novu or pub/sub)** | ❌ | 100–300 ms | Medium | trivial (login-scoped) | ✅ | ✅ | Rejected as primary (offline). Novu specifically is the wrong shape |
| **F. WordPress relay (REST poll/SSE)** | ❌ | 5–15 s (poll) | Medium | trivial | ✅ | ✅ | Rejected as transport; useful for pairing registry / signaling only |

## 8. Recommendation

Ranked by v1 fit:

1. **Electron second window over IPC** (option A). No transport research needed — it's a
   `BrowserWindow` loading a `/customer-display` route of the existing bundle, fed by the same
   process. Mirrors Odoo's local mode. Ship the *protocol* here first: define the versioned
   JSON message set (`display.hello`, `cart.updated`, `payment.state`, `display.idle`, media
   config) and drive the window through it rather than through shared app state — that message
   contract is the piece every later transport reuses.
2. **POS-hosted WS server in Electron main + LAN browser page** (option B). Node `http` + `ws`
   in the main process (precedent: `printer-discovery.ts`, `http-bridge.ts`), serving a small
   static display page and a WS endpoint. Pair by QR encoding `http://<ip>:<port>/#<token>`
   (Shopify model) with the URL also shown in text for TVs (type it once, Loyverse model);
   persist paired-display tokens for silent reconnect. Advertise over mDNS with the existing
   `bonjour-service` dep as a nicety, never as the only path. Fully offline-capable.
3. **Standalone display app later = a native WS client of the same server + mDNS browse UI.**
   The client side needs no exotic libs (RN WebSocket client is built in);
   `react-native-zeroconf` or `@dawidzawada/bonjour-zeroconf` adds "displays/POS found on your
   network", with iOS `NSLocalNetworkUsageDescription`+`NSBonjourServices` and the Android 16
   local-network permission handled at that point. If/when an iPad-only shop (no Electron) must
   host the display, add option C (WS framing over the already-linked `react-native-tcp-socket`)
   behind the same protocol.
4. **Browser-POS + LAN display stays open, not foreclosed**: the message protocol doesn't care
   about transport, so a WebRTC data channel signaled through the WordPress REST API (option D)
   can be added for the web platform if demand shows up. Cloud/WP relays remain rejected as
   primary transports (offline constraint) but are the natural signaling/pairing-registry
   layers for that mode.

**What not to do:** don't route live cart state through Novu or the WordPress site; don't make
mDNS the required pairing path (multicast dies on real merchant networks and drags in the iOS
prompt/Android-16 permission earlier than needed); don't attempt TLS on the LAN server for v1;
don't build option C before a concrete no-Electron deployment demands it.

## Sources

Primary/vendor: [Shopify Customer View](https://help.shopify.com/en/manual/sell-in-person/hardware/customer-view-app) ·
[Loyverse CDS config](https://help.loyverse.com/help/customer-display-system) ·
[Odoo 18 customer display](https://www.odoo.com/documentation/18.0/applications/sales/point_of_sale/shop/customer_display.html) ·
[Square Register setup](https://squareup.com/help/us/en/article/8597-set-up-square-register-2nd-generation) ·
[Apple multicast networking](https://developer.apple.com/news/?id=0oi77447) ·
[Apple Local Network Privacy FAQ](https://developer.apple.com/forums/thread/663875) ·
[WWDC20 session 10110](https://developer.apple.com/videos/play/wwdc2020/10110/) ·
[Android local network permission](https://developer.android.com/privacy-and-security/local-network-permission) ·
[WP Heartbeat API](https://developer.wordpress.org/plugins/javascript/heartbeat-api/) ·
[IETF mdns-ice-candidates](https://datatracker.ietf.org/doc/html/draft-ietf-rtcweb-mdns-ice-candidates-04).
Libraries: [react-native-tcp-socket](https://github.com/Rapsssito/react-native-tcp-socket) ·
[react-native-zeroconf](https://github.com/balthazar/react-native-zeroconf) ·
[@dawidzawada/bonjour-zeroconf](https://github.com/dawidzawada/bonjour-zeroconf) ·
[expo-http-server](https://github.com/simonsturge/expo-http-server) ·
[@dr.pogodin/react-native-static-server](https://www.npmjs.com/package/@dr.pogodin/react-native-static-server).
Secondary: [mDNS in WebRTC (bloggeek)](https://bloggeek.me/webrtcglossary/mdns/) ·
[Mozilla bug 1698141](https://bugzilla.mozilla.org/show_bug.cgi?id=1698141) ·
[WordPress WebSockets 2026 state of play](https://belovdigital.agency/blog/implementing-websockets-in-wordpress/).
Local: `packages/printer/src/transport/network-adapter.ts`, `packages/virtual-printer/README.md`,
`packages/core/src/services/novu/client.ts`, wcpos/electron `src/main/{printer-discovery,http-bridge}.ts`.
