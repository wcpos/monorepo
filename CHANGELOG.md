# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-05-15

### Added
- **Coupons page** — browse, search, and apply coupons in POS, including sequential discounts and coupon pills in the cart
- **Receipt Template Studio** — in-app receipt designer with live preview, print lab, and offline rendering
- **Order view modal** — redesigned order detail screen with cleaner refund flow
- **Pro Preview mode** — free users can preview Pro features
- **Printer overhaul** — new Printing settings tab, auto-detection wizard, network printer discovery, and full-receipt raster mode for high-fidelity thermal output
- **Customer & store tax IDs** — structured tax ID fields on customers, stores, and receipts
- **Store timezone and address** as first-class fields
- **Cart improvements** — optional product image column, dropdown for add buttons, multi-select on Combobox/Select
- **Version gate** — blocks the app when the PHP plugin is out of date

### Changed
- Receipt template schema cleanup (`grand_total` → `total`; `meta`/`receipt` blocks removed)
- Upgraded to RxDB v17 storage backends
- Customer/address dialogs widened for easier editing
- Many dependency and security updates

### Fixed
- Calculation parity with WooCommerce: tax, discount, refund rounding, sale price subtotals, inclusive discount handling
- Thermal printing: centering, alignment, line spacing, raster scaling, iOS test print crashes
- Orders page slow load with large order counts
- Mobile Orders filter loop and filter bar regressions
- Refund modal tax and remaining-quantity display
- Variation popover empty state
- Connect/auth error display and reconnected sites missing from user list
- Token refresh infinite loop
- Native payment WebView dispatch
- Infinite scroll viewport fill on small screens

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
