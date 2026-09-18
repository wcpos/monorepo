# Behaviour ledger: `webview`

Seeded 2026-09-18 from `.claude/research/2026-09-12-component-behaviour-ledger.md` on `research/component-ledger` (wcpos/roadmap#285) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** An embedded-document wrapper providing a shared messaging interface over native WebView and browser iframe implementations.

**Base:** Native `react-native-webview` with Lodash string detection; web DOM `<iframe>` inside React Native `View`, with `@rn-primitives/hooks` ref composition. Split: `index.web.tsx` versus `index.tsx`; no `Platform.OS` or `Platform.select` branches.

## Lines

1. Parses native JSON message strings while retaining the original event for non-JSON messages — evidence: `3d93c8ab56 2025-03-08 fix webview for native payments`, code: `"If it's not valid JSON, just pass the original event"` in `packages/components/src/webview/index.tsx:100`.
2. Wraps browser iframe messages in `nativeEvent` for the shared payment handler — evidence: `7c7c2251d7 2026-02-12 fix: repair web payment postMessage and add fallback order fetch`, code: `"nativeEvent: {"` in `packages/components/src/webview/index.web.tsx:100`.
3. Dispatches native host messages to both window and document listeners with a legacy MessageEvent constructor path — evidence: `8decbab5b2 2026-05-15 fix: dispatch native webview payment messages`, code: `"dispatchMessage(document);"` in `packages/components/src/webview/index.tsx:70`.
4. Disables bubbling for fallback native MessageEvents — evidence: `88d253b743 2026-05-14 Prevent WebView fallback message bubbling`, code: `"false,"` in `packages/components/src/webview/index.tsx:59`.
5. Gives native inline HTML precedence over URI input even when `srcDoc` is an empty string — evidence: `2934e7bc71 2026-03-06 fix: address CodeRabbit review feedback`, code: `"const source = srcDoc != null ? { html: srcDoc } : { uri: src || '' };"` in `packages/components/src/webview/index.tsx:80`.
6. Reports same-origin iframe content dimensions through ResizeObserver while forwarding native content-size events — evidence: `a2c5f36d35 2026-05-14 fix: size receipt preview to measured content, drop thermal frame chrome`, code: `"const observer = new ResizeObserver(() => measureContentSize());"` in `packages/components/src/webview/index.web.tsx:153`.
7. Corrects the native content-size callback type to expose the runtime `contentSize` payload — evidence: code: `"but it is populated at runtime — the cast bridges the upstream gap."` in `packages/components/src/webview/index.tsx:113`.
8. Applies iframe margin and overflow resets only when content-size reporting is requested — evidence: `5ffe475fb9 2026-05-14 fix: gate webview content sizing reset`, code: `"if (!onContentSizeChangeRef.current) return;"` in `packages/components/src/webview/index.web.tsx:133`.
9. Keeps ResizeObserver callbacks pointed at the latest content-size handler without resubscribing — evidence: code: `"iframe load — always invokes the current handler without re-subscribing."` in `packages/components/src/webview/index.web.tsx:51`.
10. Supports optional browser messaging origin pinning for mini-app hosts — evidence: `0b8e7c2e92 2026-09-02 feat(mini-apps): mini-app host, bridge, printer capabilities and catalog`, roadmap #133 and wiki #1088, code: `"localRef.current?.contentWindow?.postMessage(message, targetOrigin ?? '*');"` in `packages/components/src/webview/index.web.tsx:80`.
11. Binds pinned incoming browser messages to the rendered iframe as well as its origin — evidence: `3b594c308d 2026-09-02 fix(mini-apps): address review — handshake gate, iframe source binding, safe default swap, catalog validation`, code: `"(origin !== targetOrigin || event.source !== localRef.current?.contentWindow)"` in `packages/components/src/webview/index.web.tsx:95`.
