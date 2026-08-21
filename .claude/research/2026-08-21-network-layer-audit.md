# Network layer audit — platform HTTP API fit (2026-08-21)

**Question (owner, verbatim):** "this is a cross platform app, if we are using fetch for web then we should be using `net` for electron and whatever the native ios and android http layers are, right?"

**Answer:** Half right. Web, iOS and Android are already on the correct platform stacks — React Native's `fetch` and axios both bottom out in NSURLSession/OkHttp, so there is nothing to migrate on mobile. The one real gap is Electron: every renderer HTTP request tunnels over IPC to a **Node axios** handler in the main process, which means the desktop app ignores the system proxy, ignores the OS certificate trust store, speaks HTTP/1.1 only, and (measured) opens a fresh TCP+TLS connection for **every** 10-second sync poll. Electron 41's `net.fetch()` (Chromium's network stack) fixes all four at once, behind the same IPC seam. That migration is the headline recommendation; everything else is smaller.

Evidence discipline: every mechanism claim below is tagged **[measured]** (reproduced locally), **[code]** (file:line in this repo), or **[doc]** (authoritative documentation, not independently reproduced). Section 12 lists the claims that remain unverified live and gives the experiment recipes.

---

## 1. The transport map

Three lanes plus three specials. Line numbers are at `main` @ f2b1573197 (worktree `worktree-network-layer-audit`, electron submodule @ 84e8f5eb).

### Lane A — axios (UI/REST)
- `packages/hooks/src/use-http-client/http.ts:1-3` — `export const http = axios`, the native default. `http.web.ts` is byte-equivalent (see §10). `http.electron.ts:200-234` replaces the transport with `ipcRenderer.invoke('axios', …)`.
- `use-http-client.tsx:168-233` — the shared hook: pre-flight checks (sleep/offline/auth/paused via `request-state-manager.ts:226-265`), `X-WCPOS: 1` injection (skippable with `wcposHeaders:false`), HEAD tunnelling, a global Bottleneck queue (`request-queue.ts:10-38`, maxConcurrent 10, highWater 50, BLOCK).
- **No axios interceptors anywhere** — the "interceptor chain" is an explicit error-handler chain (`use-http-client.tsx:23-130`) plus `create-token-refresh-handler.ts` (priority 100, 401-only, retry-once).
- ~27 non-test consumers across `packages/core` + `apps/main` (auth testing/discovery, site info, `use-rest-http-client`, refund form, image attachment, novu subscriber sync, receipt PDF).
- Electron main handler: `apps/electron/src/main/axios.ts:58-176` — Node axios, `AbortController` map keyed by requestId, serialized response/error over IPC; the preload whitelists the `axios` invoke channel (`apps/electron/src/preload.ts:100-117`, registry in `packages/printer/src/ipc/channels.cts:93-112`). Dev-only TLS bypass at `axios.ts:41-50` (`NODE_ENV==='development'`: `NODE_TLS_REJECT_UNAUTHORIZED=0` + `https.Agent({rejectUnauthorized:false, family:4})`). Verified dev-gated — **not** a production hole.

### Lane B — engine fetch (all sync)
- Port: `packages/sync-engine/src/create-rxdb-sync-engine.ts:255-257` — `fetcher?: EngineFetcher`, default `globalThis.fetch` (line 695). Carries change-signal, scheduler, maintenance, conflict-resolution, write-drain, census.
- App fetcher: `apps/main/lib/engine-fetcher.ts:97-378` — injects `X-WCPOS: 1` (117), `X-WCPOS-Store` scope (120-126), bearer/JWT-as-param (128-136), `_wcpos_envelope=1` on non-push routes (140-145); runs its own 401→refresh→retry arc (313-377) via the **same** `refreshAccessToken` module as Lane A (`apps/main/app/(app)/_layout.tsx:26,106-107`).
- Platform split: `engine-platform-fetch.ts:1` exports `undefined` (web/native fall through to real fetch); `engine-platform-fetch.electron.ts:24-63` converts fetch→axios-config→IPC→**rebuilds a `Response`** in `toResponse()` (10-22): body stringified, headers rebuilt from a plain object, non-string request bodies throw `TypeError` (26-28).
- Engine wrapper: `create-rxdb-sync-engine.ts:696-764` — server-pressure observation, abort-vs-timeout discrimination by request age (`ABORT_AS_TIMEOUT_AFTER_MS = 10_000`, line 330), second idempotent `hydrateResponse` pass (B9 envelope).

### Lane C — refresh mini-lane
- `refresh-http-client.ts:25-58` (web/native) uses **raw `fetch`**, not axios; `refresh-http-client.electron.ts:37-95` rides the same `'axios'` IPC channel. Deliberately outside the handler chain so a refresh can't recurse into itself.

### Specials
- **Printer**: Electron raw TCP via Node `net.Socket` over IPC (`apps/electron/src/main/print-raw-tcp.ts:6-62`, 10s timeout); native raw TCP via `react-native-tcp-socket` (`packages/printer/src/transport/network-adapter.ts`); web via vendor HTTP endpoints — Epson ePOS SOAP / Star WebPRNT (`network-adapter.web.ts:7-19`) because browsers cannot open TCP sockets. All three are the right APIs for their platforms.
- **Novu**: Electron main owns the `@novu/js` client + WebSocket (`apps/electron/src/main/novu.ts`), renderer gets an IPC façade (`packages/core/src/services/novu/client.electron.ts`); other platforms construct the SDK in-process.
- **Updater**: `apps/electron/src/main/update.ts:93-94` — direct main-process axios with `responseType:'stream'`, hourly check. Same Node-stack exposure as Lane A's Electron path (see §3).

---

## 2. Per-platform API fit (audit Q1)

| Platform | Engine lane | UI lane | Verdict |
|---|---|---|---|
| Web | browser `fetch` | axios → browser XHR | **Correct.** Both ride Chromium/WebKit: system proxy, OS trust store, HTTP/2, shared socket pool. No change. |
| iOS | RN `fetch` (whatwg-fetch polyfill over RN XHR) | axios → RN XHR | **Correct — already native.** RN 0.86.2's fetch is `require('whatwg-fetch')` over `XMLHttpRequest` (`node_modules/react-native/Libraries/Network/fetch.js:15`), whose native handler is NSURLSession (`RCTHTTPRequestHandler.mm`) [code]. NSURLSession gives system proxy incl. PAC, OS trust store, H2 [doc]. |
| Android | same polyfill | axios → RN XHR | **Correct — already native.** `NetworkingModule.kt` + `OkHttpClientProvider.kt` [code]. OkHttp: system `ProxySelector`, platform trust store, H2 [doc]. Caveats in §3. |
| Electron | fetch→axios→IPC→**Node axios** | axios→IPC→**Node axios** | **The gap.** `net`/`net.fetch` never imported anywhere in `apps/electron` (verified by import sweep). Node stack: bundled Mozilla CA only, no system proxy, HTTP/1.1, ~zero connection reuse at poll cadence (§4-5). Best available API: `net.fetch()` (Electron ≥ 41.7.1 here — 41.10.5, Chromium 146, Node 24.18.0). |

**Why the IPC seam itself is right and must stay:** the renderer loads from a custom `wcpos://` scheme in production (`apps/electron/src/main/window.ts:21-24`), so renderer-direct `fetch` to an arbitrary merchant server is cross-origin and depends on the server's CORS headers — not deployable across arbitrary WooCommerce hosts. Requests made **in the main process** (whether Node axios or `net.fetch`) are CORS-free. Correction to the handoff's framing: the renderer is **not** sandboxed (`window.ts:38`, `sandbox: false`); CORS, not sandboxing, is what rules out renderer-direct fetch.

`net.fetch()` costs, examined:
- Cancellation: `AbortSignal` is supported — the existing requestId→AbortController map carries over unchanged [doc].
- `validateStatus: null` ≈ fetch semantics (never throws on status) — the engine's Electron adapter already emulates fetch semantics on top of axios; with `net.fetch` that emulation becomes a passthrough.
- `responseType: 'text' | 'arraybuffer'` → `response.text()` / `response.arrayBuffer()`.
- Dev TLS bypass equivalent: `app.commandLine.appendSwitch('ignore-certificate-errors')` or a dev-only `setCertificateVerifyProc`, gated exactly as today.
- Known `net.fetch` limitations: no `data:`/`blob:` schemes, `Response.type/url` incorrect, `integrity` ignored, must wait for app `ready` [doc, electronjs.org/docs/latest/api/net]. None of these touch the bridge's usage.
- The UI lane's axios *client-side* API surface (error shapes, `AxiosError` reconstruction) is unaffected — only the main-process handler changes; the renderer keeps reconstructing the same serialized shapes.

---

## 3. Merchant-network behaviour (audit Q3 — the money section)

The client-side twin of the hostile-headers program: merchant networks put corporate proxies, TLS-intercepting middleboxes (Zscaler/Netskope-class), enterprise CAs and captive portals between the POS and the store.

| Concern | Web | iOS | Android | Electron today (Node axios) | Electron on `net.fetch` |
|---|---|---|---|---|---|
| System proxy (incl. PAC/WPAD) | ✅ browser [doc] | ✅ NSURLSession [doc] | ✅ ProxySelector [doc] | ❌ env vars only (`HTTP(S)_PROXY`); no PAC, no OS proxy config [doc] | ✅ "automatic management of system proxy configuration, support of the wpad protocol and proxy pac configuration files" [doc, Electron net] |
| Authenticating proxies (NTLM/Kerberos/Negotiate) | ✅ | ✅ | partial | ❌ | ✅ basic/digest/NTLM/Kerberos/negotiate [doc, Electron net] |
| OS trust store / enterprise CA | ✅ | ✅ | ✅ *system* CAs; **user-added CAs untrusted by default since Android 7** — no `networkSecurityConfig` opt-in exists in `apps/main/app.config.ts` [code] | ❌ Node bundled Mozilla CA snapshot only (`--use-bundled-ca` is the Node 24 default [measured, `node --help`]). Enterprise/self-signed CA in the OS keychain is **not** consulted → TLS failure | ✅ Chromium verifier against platform store [doc] |
| TLS-intercepting corporate proxy | works (corp CA in OS store) | works | works (MDM-deployed CA = system-ish) | **fails** — re-signed cert chains to a CA Node doesn't have. This is the "works in browser, fails in desktop app" support-ticket class | works |
| Captive portal | browser shows portal | OS-level detection | OS-level detection | request just fails/hangs (no timeout — §5) | still no portal UI, but reachability ping + system-proxied networking behave like the browser |
| Plain-HTTP store URLs | ✅ | ❌ ATS blocks `http://` by default — no `NSAppTransportSecurity` exception in `app.config.ts` [code] | ❌ cleartext blocked by default (target ≥ 28), no manifest opt-out configured [code] | ✅ (Node doesn't care) | ✅ |

Notes:
- The dev-only TLS bypass (`axios.ts:41-50`) means self-signed dev stores work in development — so **development never exercises the production trust path**, which is exactly where merchant failures live.
- The updater (`update.ts`) and Novu WebSocket (`novu.ts`) ride the same Node stack in main: a corporate-proxy merchant network can silently break auto-update and notifications too, not just store sync.
- Unverified live: the CA-divergence and system-proxy rows for Electron are [doc]-tier — recipes in §12. The Node CLI default (`--use-bundled-ca (default)`) was confirmed on Node 24.14 locally; whether Electron's BoringSSL-built Node honors `--use-system-ca` is unknown (and irrelevant if `net.fetch` lands).

---

## 4. Connection reuse / keep-alive / HTTP/2 (audit Q4) — measured

The engine polls continuously: change-signal every **10s**, write-drain every **10s** (`packages/sync-engine/src/maintenance/lane-registry.ts:5-6`), plus 30s–17min maintenance lanes.

Measurement (Node 24.14 ≈ Electron 41's Node 24.18, axios 1.19.0 — the exact prod pair; local HTTP server counting TCP connections; script preserved in the audit branch history):

| Scenario (Electron main lane) | Result |
|---|---|
| 5 back-to-back requests, default agent (prod config) | **1 connection** — keep-alive works when busy |
| 4 requests at the real 10s tick spacing, server keep-alive 60s | **4 connections — zero reuse.** Node's global agent drops free sockets after ~5s idle |
| 5 back-to-back, dev agent replica (`Agent({family:4})`, no `keepAlive`) | **5 connections — zero reuse even back-to-back** (dev-only) |
| same dev agent + `keepAlive:true` | 1 connection |

So an idle Electron terminal performs **~360+ full TCP+TLS handshakes per hour** for change-signal alone (~720 with write-drain when staggered), against a merchant server that is often far away and behind TLS. Web/iOS/Android pay none of this — their platform pools hold connections across ticks and multiplex over H2 [doc]. `net.fetch` uses Chromium's shared socket pool and speaks HTTP/2 [doc]. Interim one-line fix if the migration waits: a `keepAlive: true` agent with a `freeSocketTimeout` above the tick interval in `main/axios.ts` — but that still buys none of §3.

HTTP/2: Node `https` (axios's adapter) is HTTP/1.1-only [doc]; every other lane on every platform can negotiate H2.

---

## 5. Cancellation, timeout, retry (audit Q5)

- **Cancellation** is consistent and works across the IPC hop: renderer maps `AbortSignal`/legacy `cancelToken` → `{type:'cancel', requestId}` → main aborts (`http.electron.ts:158-187`, `axios.ts:62-71`). The engine's Electron adapter maps cancel back to `DOMException('AbortError')` (`engine-platform-fetch.electron.ts:44-50`).
- **Timeout: the axios lane has none.** No default timeout in `http.ts`, `http.web.ts`, the hook, or the main bridge — axios default is 0 = infinite. Only the auth/discovery flows set per-call timeouts (10s: `use-auth-testing.ts:43-52`, `use-url-discovery.ts:16-38`; 15s: `use-api-discovery.ts:148-167`). A refund-list fetch, a receipt PDF, an image download, novu subscriber sync — all can hang indefinitely on a black-holed connection (captive portal, dead middlebox). The refresh mini-lane also sets no timeout (`refresh-http-client.ts:36-58`).
- **The engine lane** has no general fetch timeout either, but its exposure is bounded differently: the only explicit deadlines are 5s for config hydration (`create-rxdb-sync-engine.ts:1416-1447`) and 10s for the barcode lookup (`use-barcode.ts:24-62`); everything else relies on lane-level abort merging (change-signal/maintenance/write-drain manually merge caller+scope+ticket signals because the RN polyfill lacks `AbortSignal.any` — `change-signal-lane.ts:247-272`, `maintenance-lanes.ts:343-387`) and the age-based abort-vs-timeout discriminator (`create-rxdb-sync-engine.ts:716-740`). A hung poll therefore stalls a lane tick, but the serialized tick chain recovers on the next tick rather than hanging UI.
- **Retry:** axios lane — handler-driven only (max 3, used once by token refresh; no network/5xx retry; Bottleneck `failed` only logs). Engine lane owns a full policy: scheduler tasks retry on fixed 30s `retryAfterMs` with a 100-request per-task ceiling and no dead-letter state (`rx-scheduler-task-runner.ts:391-470`); writes use persisted 1s→60s exponential backoff ±10% jitter with no attempt cap (`recordRetryBackoff.ts:1-68`); retryable 4xx = {408, 409, 425, 429}, others park durably as `rejected`/`conflicted`/`needs-revision` (`drainMutationQueue.ts:95-124, 398-523, 614-781`). Receipt e-mail queue has its own 6-attempt/30s→15min backoff (`email-queue/queue.ts:414-448`). No conflict between lanes, but the axios lane's "no retry, no timeout" combination means UI failures surface only as user-visible hangs.

**Recommendation:** a default timeout at the `use-http-client` seam (per-request overridable), not per-call sprinkling.

## 6. Body & streaming handling (audit Q6)

- `toResponse()` lossiness (`engine-platform-fetch.electron.ts:10-22, 26-28`): JSON re-stringification (axios `responseType:'text'` keeps bodies as text, so normally verbatim), headers rebuilt from a plain object (multi-value headers collapse), **non-string request bodies throw**. Today the engine only sends JSON strings, so this is a latent trap, not a live bug — but it hard-blocks any future binary sync payload on Electron only.
- Receipt PDF (`use-download-receipt-pdf.ts:40-45`, `responseType:'arraybuffer'`): on Electron the Node `Buffer` structured-clones across IPC to a `Uint8Array`, which `PdfBytes` accepts (`save-or-share-pdf.ts:5`) — works, undocumented, worth a comment/test. Same pattern for external images (`use-image-attachment/index.web.ts:56`, resolved on Electron too since no `.electron` variant exists and Metro's Electron build prefers `.electron → .web`, `apps/main/metro.config.js:72-83`).
- No streaming anywhere in either lane (all buffered); the only `responseType:'stream'` is the updater in main. RN's fetch polyfill has no `ReadableStream` bodies — irrelevant today since nothing streams.
- Printer IPC converts `Uint8Array → number[]` at the boundary (`packages/printer/src/transport/ipc-print.electron.ts:13-45`) instead of letting structured clone carry the typed array — for large raster receipts that's a ~8× memory shape and a JS-array walk per print. Works; worth folding into any bridge rework.
- Dev-only wart: `main/axios.ts:88-114` JSON-stringifies every response body **twice** for logging — for an arraybuffer PDF that's serializing megabytes into the log path (dev only).

## 7. Auth / token-refresh coverage (audit Q7)

Both lanes converge on the **same** `refreshAccessToken` module and its single-flight promise in the request-state singleton (`refresh-access-token.ts:66-153`, `request-state-manager.ts:305-350`) — cross-lane refresh stampedes are already prevented. Differences are orchestration only: Lane A uses the priority-100 handler (401-only, retry-once, `authFailed` latch on second 401); Lane B runs its own arc with token-comparison fast-path (`engine-fetcher.ts:327-332`) and log-level settlement (#899). 403 is never refreshed in either lane (deliberate, 1.9 row-14 rule). JWT-as-param supported in both. **No divergence worth fixing.** One asymmetry to note: Lane A's pre-flight blocks (sleep/offline/paused) do not gate Lane B — by design, the engine has its own connectivity gate (§8).

## 8. Offline / connectivity detection (audit Q8)

- Native: NetInfo with reachability against `/wcpos/v2/ping`, 60s reachability timeout (`packages/hooks/src/use-online-status.tsx:22-43`).
- Web: `navigator.onLine` + online/offline + visibilitychange, a 30s visible-page recheck, and a 45s "recent successful traffic" trust window fed by the engine's network pulse (`use-online-status.web.tsx:35-176`); reachability is HEAD-then-GET with a 10s abort (`check-website-reachability.ts:3-36`). Electron re-exports web, with reachability riding the IPC bridge at a 10s axios timeout (`use-online-status.electron.tsx:1-12`, `check-website-reachability.electron.ts:1-25` — a *documented* re-export, not a dead variant).
- Engine port: `connectivity?` (default `'online'`) fed by `apps/main/lib/connectivity.ts` mapping the three-state OnlineStatus; `_layout.tsx:204` keeps it aligned. Tick gate reacts to offline→online (`automatic-tick-gate.ts:43-48`).
- Coherent per-platform. No change recommended.

## 9. Certificate pinning (audit Q9) — recommend against, with one narrow exception

Pinning the **merchant's** server is wrong for this product: WCPOS talks to thousands of self-hosted WooCommerce stores whose certs rotate on 90-day Let's Encrypt cadence outside our control — a pin would brick tills at renewal. The defensible scope is **wcpos-owned endpoints only** (updates server, Novu): viable on Electron (`setCertificateVerifyProc`), iOS (URLSession delegate), Android (`networkSecurityConfig` pin-set with expiry), impossible on web (HPKP is dead). Even there, value is modest while update payloads are already integrity-checked by signature. **Recommendation: no pinning now; revisit only if the update channel's threat model changes.** No issue filed.

## 10. Convergence & false affordances (audit Q2, Q10)

**Keep both lanes — with this boundary rule:** *the engine owns everything that syncs (fetch-contract port, envelope hydration, pressure/cadence, its own refresh arc); the axios lane owns interactive UI requests (pre-flight UX states, queue, WP-error enrichment, toasts).* They already share the refresh core and the `X-WCPOS` discipline. Full convergence would mean rebuilding Lane A's UX semantics on fetch for zero merchant-visible gain — not worth it. What **should** converge is the Electron transport underneath both: one main-process handler (on `net.fetch`) serving both IPC channels, which also lets `engine-platform-fetch.electron.ts` stop paying the fetch→axios→fetch double conversion.

**The `fetcher?` port default (loose end #2) — decision: make the port required.** The default (`create-rxdb-sync-engine.ts:695`) can never work against a WCPOS server (no `X-WCPOS` marker → `rest_no_route`; no bearer; no store scope — all injected in `apps/main/lib/engine-fetcher.ts`). Both production construction sites pass a fetcher (`create-app-engine.ts:393-424`; the test harness always creates one, `engine-harness.ts:220-265`); the omission sites are all tests — slightly more than the handoff's three (tier-collection, bootstrap-failure, disposal-wedge ×2, setup-failure, plus two conditional helpers in coverage-changes and ready-watchdog), none of which depends on the default actually reaching a server. A throwing stub satisfies them. The default has already produced one false-positive Major review finding. A required port converts "can never work" into a compile error; the doc comment moves to the app fetcher. (Fallback if Paul prefers keeping the generic-engine ergonomics: amend the port doc to "default suits only unauthenticated/non-WCPOS backends" + emit a construction-time diagnostic when defaulted — but required is the real fix, not the half.)

**Sibling sweep:** `http.web.ts` is byte-equivalent to `http.ts` (both `export const http = axios`) — redundant file, harmless, fold into hygiene. `use-online-status.electron.tsx` looks like a no-op re-export but is load-bearing (platform-resolves the reachability import) and says so — fine. The other optional engine ports (`checkpoints`, `uuid`, `random`, `connectivity`, `writePlaneOwner`) have genuine, working defaults — no false affordances found among them. `use-http-error-handler.tsx` is exported nowhere and wired nowhere (`use-http-client.tsx:162-164` keeps it commented out) — dead code, hygiene. README stale claim (`README.md:111-115` says cancellation returns a pending promise; code throws, `use-http-client.tsx:272-287`) — hygiene.

**Refund pagination (loose end #1) — decision: neither envelope read nor lane migration; drop the header dependence entirely.** `form.tsx:174-189` reads `x-wp-totalpages` with a silent `|| 1` fallback and fans out pages 2..N. Under a header-stripping proxy it fetches page 1 only. Mitigating fact the handoff didn't have: `per_page: 100`, so it takes an order with >100 refunds to lose data — rare, but the lost rows feed `maxRefundable` (`form.tsx:203-208`), i.e. under-counting **enables over-refunding real money**. The robust fix is loop-until-short-page (fetch pages until a page returns < per_page rows): no header, no envelope dependency, works on every lane and every proxy.

---

## 11. Prioritized recommendations (audit deliverable 2)

Ordered by merchant impact. "Size" = rough implementation effort including tests.

| # | Change | Platform | Benefit | Risk | Size |
|---|---|---|---|---|---|
| 1 | Migrate the Electron main-process bridge from Node axios to `net.fetch()` (both IPC channels; updater + novu optional follow-ups) | Electron | System proxy incl. PAC + auth proxies; OS trust store (enterprise CA / TLS-intercepting proxies); HTTP/2; connection reuse across 10s ticks (kills ~360-720 TLS handshakes/hr/terminal); un-losses the engine adapter | Behaviour shift on hostile networks must be verified with mitmproxy + self-signed matrix; dev TLS bypass needs the Chromium-flag equivalent; `net.fetch` quirks (`Response.url/type`) are cosmetic here | M (one file rewrite + adapter simplification + live verification) |
| 2 | Default request timeout at the `use-http-client` seam (per-request overridable), aligned with the engine's abort-vs-timeout discrimination | all | Hung-middlebox/captive-portal requests fail fast instead of hanging UI forever | Long-running legitimate requests (large PDF) need a generous ceiling or per-call override | S |
| 3 | Refund list: loop-until-short-page pagination (remove `x-wp-totalpages` dependence) | all | Closes the B9 Tier-2 gap for refunds; prevents header-stripped under-count feeding `maxRefundable` (over-refund risk) | negligible | S |
| 4 | Make the engine `fetcher` port required; move the marker/auth/scope contract doc to the app fetcher | all (engine) | Removes the false affordance that already produced a false review finding; compile-time truth | 3 lifecycle tests need a stub | S |
| 5 | Document + decide mobile TLS/cleartext posture: Android user-CA `networkSecurityConfig`, iOS ATS, plain-HTTP stores | iOS/Android | Today a merchant self-signed/enterprise-CA HTTPS store silently fails on mobile with no dev-style bypass; an `http://` store fails on both | Posture decision is product-level (security vs support burden) | S (doc + decision; config change tiny once decided) |
| 6 | Hygiene: delete redundant `http.web.ts`, dead `use-http-error-handler`, fix stale README cancellation claim, stop double-stringifying binary bodies in dev logging | — | Less to mislead the next auditor/reviewer | none | XS |

Interim option if #1 stalls: `keepAlive:true` agent (with `freeSocketTimeout` > 10s) in `main/axios.ts` — one line, erases the handshake cost, buys none of the proxy/CA wins. Explicitly a half-measure ("real fix, not halves"), recorded here so nobody mistakes it for the fix.

**Explicit null results:** printer transports (all platforms), Novu split, offline detection, auth-refresh coverage, iOS/Android HTTP APIs — audited, **no change needed** (evidence in §§2, 7, 8, and the transport map).

## 12. Unverified claims register + recipes

Claims left at [doc] tier, with the experiment that would upgrade them:

1. **Electron+Node ignores OS trust store / `net.fetch` uses it.** Recipe: `mkcert`-style self-signed CA → add to macOS keychain (System, trusted) → serve HTTPS → prod-mode Electron build requests via both bridges. Expect: Node axios `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; `net.fetch` 200. Needs sudo for keychain + a prod build — not run in this audit.
2. **System-proxy divergence.** Recipe: mitmproxy on :8080, macOS system proxy set to it, no env vars; run both bridges. Expect: Node axios connects direct; `net.fetch` traverses proxy. Needs admin networksetup — not run.
3. NSURLSession/OkHttp proxy+trust behaviour on device — standard platform behaviour [doc]; would need device/simulator + mitmproxy to reproduce.
4. Chromium socket-pool idle lifetimes ("minutes-scale") — [doc]-tier; the decisive comparison (per-tick handshakes vs reuse) was measured for the Node side only.
5. Whether Electron's BoringSSL Node honors `--use-system-ca` — unknown; moot under recommendation #1.

What **was** measured: connection-reuse table in §4 (Node 24.14 + axios 1.19.0, matching prod versions); Node 24 CA/proxy CLI defaults; RN 0.86.2 fetch→XHR→NSURLSession/OkHttp chain read in the installed source.

## 13. Issues filed

| Rec | Issue |
|---|---|
| 1 | [#1411](https://github.com/wcpos/monorepo/issues/1411) — Electron: migrate the main-process HTTP bridge from Node axios to `net.fetch` |
| 2 | [#1412](https://github.com/wcpos/monorepo/issues/1412) — use-http-client: no default request timeout |
| 3 | [#1413](https://github.com/wcpos/monorepo/issues/1413) — Refund form: drop the `x-wp-totalpages` header dependence |
| 4 | [#1414](https://github.com/wcpos/monorepo/issues/1414) — sync-engine: make the `fetcher` port required |
| 5 | [#1415](https://github.com/wcpos/monorepo/issues/1415) — Decide mobile TLS/cleartext posture |
| 6 | [#1416](https://github.com/wcpos/monorepo/issues/1416) — HTTP layer hygiene batch |

The keep-alive measurement script is preserved next to this file as `2026-08-21-keepalive-probe.cjs`.
