# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
