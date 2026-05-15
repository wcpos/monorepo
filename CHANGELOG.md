# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-05-15

### Added
- Redesigned printer setup flow with per-platform Add Printer dialogs for web, Electron, and native builds, including vendor-first selection, connection-type pickers, network scan, Bluetooth/USB device pickers, and clearer endpoint hints (#462, #463, #466).
- Full receipt raster print mode with diagnostic test-print support, raster assets, QR/barcode/image rendering, and native/Electron/web print-path parity (#406, #434, #437, #438, #439, #440, #449, #463).
- New `@wcpos/printer` package with ESC/POS encoding, thermal XML template rendering, Star printer column profiles, currency formatting, and printer transport support (#168, #172, #214).
- Multi-printer routing for receipt templates and app-side POS template switching (#184, #164).
- Template Studio as a full receipt-template development and print lab, including pipeline-parity redesign, code panel, scenario toggles, full-height stage, iframe/system print support, gallery previews, sample assets, and expanded randomizer coverage (#339, #351, #353, #355, #366, #374, #376, #377, #419).
- Browser-safe `@wcpos/receipt-renderer` package and logicless receipt renderer support for `<barcode>` plus per-line tax display fields (#335, #375).
- Expanded receipt data contract for refunds, transaction IDs, line tax labels, per-row metadata, status labels, payment state fields, printed timestamps, totals quantity/line count, structured store address fields, store tax IDs, and customer tax IDs (#368, #369, #371, #380, #386, #392, #418, #430, #436).
- POS refunds and payment-contract integration across checkout, refund destinations, cart/order displays, reports, and WebView/native payment messaging (#331, #333, #346, #348, #467).
- Redesigned order view modal with hero/rail layout, improved metadata, address formatting, and wider customer/address dialogs (#350, #357, #365, #410, #468).
- Coupon combobox search, coupon pills in cart totals, sequential discount setting support, and improved coupon page workflows (#159, #162, #174, #182).
- Hierarchical Select/Combobox primitives, multi-select support, category tree filtering, and a composable `TreeCombobox` (#238, #240, #246, #250).
- Optional product image column in the cart and expanded miscellaneous product fields for category, virtual, downloadable, and product-image workflows (#237, #268).
- Redesign of the connect/auth screen with stronger store/user sync, visible connection errors, restricted REST API handling, and outdated-plugin gating for the main app (#314, #321, #324).
- Printer discovery improvements including Electron mDNS discovery, native SDK stubs, native printer discovery wiring in Expo builds, vendor auto-detection, and first-printer empty states (#316, #317, #318, #326, #328).
- Store schema support for timezone, structured store tax IDs, and tax-based-on payload normalization (#370, #404, #345).
- Log retention cleanup that prunes entries older than 30 days on startup (#190).
- Stable E2E selector policy and local agent/review documentation for future release and review workflows (#344, #347, #414).

### Changed
- Bumped the app, Electron, web bundle, Template Studio, and versioned workspace packages to `1.9.0` (#475, wcpos/electron#226, wcpos/web-bundle#11).
- Rebuilt the checked-in web bundle so the distributed bundle reports `1.9.0` in Expo manifest/AppInfo and uses the latest generated assets (#475, wcpos/web-bundle#11).
- Migrated RxDB storage to v17 backends, aligned OPFS worker/RxDB versions, registered required FlexSearch pipeline support, and updated the storage migration path (#270, #285, #289, #389, #393).
- Reverted native storage from `expo-file-system` to `expo-sqlite` after storage compatibility work (#312).
- Updated dependency and supply-chain configuration including pnpm, Uniwind, Nitro modules, RN primitives, axios, lodash, PostCSS, dependency grouping, Dependabot settings, and pnpm 11 supply-chain rules (#176, #196, #198, #207, #272, #274, #276, #277, #283, #294, #309, #320, #336, #338, #343, #361, #387, #388, #433, #453, #454).
- Consolidated printing settings into a single tab, then redesigned POS Settings > Printing for the new printer workflow (#186, #464).
- Improved thermal printer profile handling with configurable columns, standard 42-column support, explicit diagnostic sizing, and clearer vendor-selected state (#405, #409, #452, #470).
- Expanded receipt/template i18n coverage, source-string product naming, translation version cadence, and short receipt-table labels (#364, #367, #372, #396, #403, #411, #415, #428, #432, #435, #459, #460).
- Cleaned up Template Studio paper sizing by deriving paper width from templates and making print/preview dimensions match real output (#373, #385, #425, #455, #456, #457).
- Split print platform behavior into platform modules instead of runtime `ipcRenderer` checks (#213).
- Improved CI and repository automation: optimized GitHub Actions, skipped unnecessary deploy/E2E paths, added daily submodule bumps, GitHub App token handling, and e2e screenshot cleanup (#204, #205, #218, #288, #315, #325, #327, #356).
- Added wiki submodule support and removed deprecated `.kb` content from the repo (#304, #306).
- Modernized radio group primitives and tightened React Native type definitions around `className` usage (#363, #458).

### Fixed
- WooCommerce parity for tax, rounding, coupon discounts, stacked-discount capping, sequential discounts, sale-price discount bases, inclusive discount decomposition, discount-tax calculation, float artifacts, decimal places, deleted items, and refund rounding (#221, #223, #226, #227, #232, #233, #243, #245, #254, #258, #265, #297, #308).
- Coupon and cart data issues including coupon discount line totals, nullable coupon deletion markers, coupon metadata schema validation, tax flash while coupons are active, sale-discount rows in cart totals, and net payment display for refunded orders (#170, #185, #187, #192, #197, #216, #252, #260).
- Receipt and refund rendering bugs including refund totals/date fields, refund label/sign handling, order-date object preservation, customer tax-ID labels, localized status labels, template i18n/barcode hints, hidden presentation hints, and receipt schema v1 contract regressions (#378, #382, #394, #395, #397, #401, #402, #413).
- Thermal print fidelity across Template Studio and real printers: centered text, image alignment reset, simulator sizing/indents, line spacing, row fidelity, line styles, heading centering, scaled text alignment, status preservation, raw TCP wait/ack/release behavior, and print-button release (#412, #416, #417, #420, #423, #424, #426, #427, #441, #442, #443, #444, #447, #448).
- iOS/native printer issues including Test Print support, XML parsing without DOMParser, network print Buffer crashes, and native socket teardown behavior (#354, #469, #471, #472).
- Printer UI issues including missing test button feedback/loading state, restored printer discovery entrypoint, unified print-dialog label, and web printer vendor selected state (#191, #465, #470, #473).
- Electron UI and printing regressions around dialog layout shift, coupon search, replication deduplication, logging depth, and print behavior (#169, #212, #253).
- Native app regressions including NativeEventEmitter issues, landscape layout, miscellaneous product images, and stock-status API handling (#284).
- E2E reliability issues around IndexedDB VersionError, OPFS auth bootstrap, stale auth state, and OPFS/localStorage cleanup (#193, #275, #287).
- Storage/data integrity issues including atomic OPFS close handling, Android sync-storage corruption prevention, token refresh infinite loops, RxDB premium detection, RxDB schema validation, and table header alignment (#290, #291, #301, #302, #303).
- Orders and product UI bugs including catch-all order route params, mobile Orders filter suspense loops, infinite-scroll query pagination, viewport-fill after measurement, orders page load performance, column header press targets, variable product price consistency, variation popover empty states/custom attributes, and Product table header sorting (#296, #300, #305, #311, #313, #158, #242, #248, #261, #359, #360, #399).
- Refund UI bugs including only showing Refund for refundable order statuses and fixing refund modal tax display/remaining quantities (#171, #346).
- Product/customer component regressions including removable `ButtonPill` press forwarding, table sorting loops, and customer form dialog sizing (#177, #181, #468).
- Template Studio regressions including plugin-root docs, field tree layout, locale shuffle, A4 preview/print width, barcode preview errors/sizing, stripping `<barcode>` SVGs, renderer imports, template field sync, gallery previews, and debug log cleanup (#349, #381, #383, #385, #390, #400, #421, #422, #431, #446).
- Web/native payment and checkout compatibility including legacy POS checkout WebView mode and native WebView payment message dispatch (#348, #467).
- Installation and submodule update flow for hoisted `node_modules`, preinstall submodule updates, and private wiki submodule access in CI (#303, #327, #454).

## [1.8.11] - 2026-03-02

### Added
- Error count badge on the Logs drawer item
- Storage-level error handler wrapper for graceful RxDB error handling
- RxDB-specific error codes for conflict, schema, storage, and worker errors
- Sensitive field redaction across all logger output channels

### Fixed
- Auto receipt printing after checkout
- Custom Select trigger for touch screen activation
- Sync error toasts now log silently to DB instead of showing notifications
- Null/empty IDs in populate$ causing IndexedDB key errors
- Undefined values in local patches
- Web virtualized-list measure ref update loops
- Composite primary keys in storage error wrapper

### Changed
- Upgraded to Expo SDK 55
- Updated project dependencies

## [1.8.10] - 2026-02-18

### Fixed
- Variation context menu on the Product page
