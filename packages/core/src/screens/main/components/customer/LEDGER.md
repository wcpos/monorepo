# Behaviour ledger: `components/customer`

Seeded 2026-09-18 from `.claude/research/2026-09-18-composed-behaviour-ledger.md` on `research/composed-ledger` (wcpos/roadmap#341) by wcpos/roadmap#345. Numbers are assigned once and never reused: a struck line leaves a gap, a new line takes the next number. Every line keeps its evidence. The rules for preserving or striking a line are in the [library strategy](https://github.com/wcpos/roadmap/blob/worktree-docs%2Bdesign-program-2026-09-12/docs/design/2026-09-18-library-strategy.md), section 3. Not reworded from the source.

**Job:** Supply reusable customer identity/address forms and structured tax-ID editing.

**Composes:** `@wcpos/components/{button,collapsible,form,hstack,icon-button,modal,select,text,tooltip,vstack}`.

## Lines

1. Default password to an empty string rather than omit it — WooCommerce customer creation rejects a missing password property — evidence: “WC REST API will error if password is not provided on create” (`components/customer/customer-form.tsx:30`) — platform: all.
2. Lock username editing based on an existing customer ID, not whether username already contains text — typing a username during creation must not disable the field — evidence: `f7d9577fb2 2024-11-21 fix username field for customer create form` — platform: all.
3. Populate empty billing first name, last name, and email from top-level customer values at submission, preserving existing billing values — avoids incomplete billing data when only the main identity fields were entered — evidence: “Populate billing fields with top-level values if they are empty” (`components/customer/customer-form.tsx:76`) — platform: all.
4. Keep form body and footer separate, allow a Dialog-specific layout, and leave footer buttons as siblings — Modal/Dialog hosts must pin actions and choose row versus column layout themselves — evidence: `ad2aebea63 2026-09-11 feat(ui): overlay batch 1 — editors open as right-hand panels with pinned footers (#1975)` — platform: all.
5. Preserve structured `tax_ids[]` alongside the legacy scalar `tax_id` — customers and orders need multiple typed IDs without dropping older data — evidence: `25061f2217 2026-05-03 feat: add structured customer tax IDs across schema, forms, receipts` — platform: all.
6. New tax-ID rows default to EU VAT; changing type updates its default country and placeholder — common entry stays quick while type-specific guidance follows the selection — evidence: “EU VAT covers the most common case” (`components/customer/tax-ids-form.tsx:46`); `25061f2217 2026-05-03 feat: add structured customer tax IDs across schema, forms, receipts` — platform: all.
7. Tax-ID format warnings are advisory, partial values remain allowed, and network verification is deferred — strict form validation must not block incomplete entry — evidence: “over-strict form rules block partial entry.” (`components/customer/tax-ids-form.tsx:199`); “Network verification is a separate, deferred concern.” (`components/customer/tax-ids-form.tsx:10`) — platform: all.
