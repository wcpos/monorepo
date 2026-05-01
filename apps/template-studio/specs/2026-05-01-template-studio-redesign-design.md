# Template Studio Redesign — Design Spec

- **Date:** 2026-05-01
- **Status:** Approved, awaiting implementation plan
- **Worktree:** `monorepo-v2/.worktrees/template-studio-redesign` (branch `feature/template-studio-redesign`)
- **Companion doc:** `woocommerce-pos/docs/superpowers/specs/2026-04-29-template-studio-design.md` (current Studio handoff)

## 1. Context

WCPOS Template Studio is a Vite-based dev tool at `monorepo-v2/apps/template-studio` for designing and testing receipt templates that are used by the real WCPOS apps (electron, web, mobile). The current Studio is functional but:

- Reads templates and renders them through production functions, but **bypasses the `mapReceiptData → formatReceiptData` normalization step**, so Studio output can disagree with production output for any template that depends on formatting.
- Surfaces only a subset of the inputs that affect production rendering (no decimals/locale/tax-display knobs, no printer model, no codepage).
- Uses loose, hand-authored fixtures whose shapes don't match the canonical `ReceiptData` interface.
- Has a 3-pane chrome that is, per the user, "dog fucking ugly."
- Includes a server-fetch flow (Store URL + Template ID + Order ID) that has never carried its weight; templates are designed against synthetic data.

## 2. Goals

1. Studio renders **identically** to production for any (template, data, settings) tuple. Pipeline parity is the central goal.
2. Studio surfaces the full `ReceiptData` contract as an editable, schema-driven form so designers can probe every field.
3. Studio has rich randomized data (with edge-case coverage) so designers don't need real orders to test edge cases like RTL, refunds, fiscal data, multi-payment splits, empty carts.
4. Studio looks and feels like a modern design tool. Receipt-as-hero, paper-faithful preview, calm chrome.
5. Studio remains a daily-iteration tool: hot reload from `woocommerce-pos/templates/gallery/` continues to work; designers do not need to leave the browser to see changes.

## 3. Non-goals

- Template authoring inside the Studio. Templates are still edited as `.html` (logicless) and `.xml` (thermal) files in `woocommerce-pos/templates/gallery/`.
- Real WP store integration. The fetch flow (Store URL / Template ID / Order ID) is removed.
- USB and Bluetooth print transports. Production routes through native adapters; Studio is a browser app and only supports system print and network TCP.
- Multi-tenant or auth-protected flows. Studio is a developer tool; no login, no tenancy.

## 4. Visual direction

Light cream + ochre. Calm Linear/Notion-style chrome with a Receipt Lab personality:

- **Background:** off-white `#f7f6f2` shell with white panels (`#fbfaf6`) on cream borders (`#ebe6dd`).
- **Stage (canvas area):** warm cream `#efe9dd`. Receipt sits on it, with a soft drop shadow.
- **Accent:** ochre `#c9844a` (selected scenarios, primary CTAs, array `[ N ]` markers when populated).
- **Text:** dark warm `#2a241f`; secondary `#5a4f48`; muted `#aba6a0`; field labels `#8a7e76`.
- **Typography:** Inter UI, JetBrains Mono for code/byte views, system serif fallback only.
- **Density:** comfortable but not airy. Right panel rows ~24px tall, no excessive padding.

## 5. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar  [paper: 58 | 80mm | A4]  [zoom −  100%  +]            │
├──────────┬───────────────────────────────────┬──────────────────┤
│          │                                   │ Data       ▾    │
│ Templates│                                   │ ┌─[Shuffle]──┐  │
│  Logicless                                   │ │Search…      │  │
│  Standard│      ╔══════════════╗             │ │▾ Receipt    │  │
│ ▶Branded │      ║              ║             │ │  mode: sale │  │
│  Detailed│      ║   receipt    ║             │ │▸ Order      │  │
│  …       │      ║   (paper-    ║             │ │▾ Store      │  │
│          │      ║    faithful) ║             │ │  …          │  │
│  Thermal │      ║              ║             │ │▸ Line Items │  │
│  Simple58│      ╚════/\/\/\════╝             │ │  [ 3 ]      │  │
│  Simple80│                                   │ │…            │  │
│  Detailed│   80mm · 165 lines · 1.2KB        │ ├─────────────┤  │
│  Kitchen │                                   │ │ WooCommerce ▾│  │
│          │                                   │ │ currency …  │  │
│          │                                   │ ├─────────────┤  │
│          │                                   │ │ Print       ▾│  │
│          │                                   │ │ host/port…  │  │
└──────────┴───────────────────────────────────┴──────────────────┘
```

- **Toolbar** holds only canvas-level controls: paper size segmented control (58mm / 80mm / A4), zoom %.
- **Left panel (~200px):** templates list grouped by engine (Logicless / Thermal). Selected template is a white card with subtle shadow.
- **Center canvas:** paper-faithful preview, vertically centered, with a floating bottom pill showing `paper · line count · ESC/POS bytes`. For logicless and A4, the byte count is hidden.
- **Right panel (~300px):** three stacked sections. Each section has a sticky header with chevron toggle. All sections default to open; user-toggled state persists per session.

## 6. Right panel — three sections

### 6.1 Data

The contract-driven editor. Replaces the entire fixture-and-scenario flow.

- **Header:** title "Data" + `Shuffle` button. Optional small badge showing seed (e.g., `seed: 4f2a · ↻`).
- **Search:** filters the tree by field name or path (e.g., `tax` matches `Tax Summary`, `totals.tax_total`, `lines[].taxes`).
- **Tree:** generated from the canonical `ReceiptData` schema, sections in canonical order:
  - `Receipt` (mode)
  - `Receipt Printed` (semantic date)
  - `Order`
  - `Order Created`, `Order Paid`, `Order Completed` (semantic dates)
  - `Store`
  - `Cashier`
  - `Customer`
  - `Line Items` (array)
  - `Fees` (array)
  - `Shipping` (array)
  - `Discounts` (array)
  - `Totals`
  - `Tax Summary` (array)
  - `Payments` (array)
  - `Fiscal`
- **Array markers:** every array field shows `[ N ]` to the right of its name. Empty arrays muted (`[ ]`); populated arrays accent ochre. Clicking expands the array to a list of items, each item itself a collapsible subtree, with reorder handles and per-item delete + a section-level `+ Add` row.
- **Inline expand:** clicking a section expands it in place and reveals editable inputs. No modal, no separate inspector. Field labels are the schema keys (`name`, `address_lines`, `unit_price_incl`); a tooltip on label hover shows the full path and JSDoc description from the schema.
- **Editing semantics:** every change re-runs the pipeline (debounced 100ms) and re-renders the canvas. Numeric fields accept numeric input only; selects use schema enums (e.g., `display_tax`); array fields show subtree.
- **Reset:** chevron-menu on each section header offers "Revert section" (discard the user's edits within that section, returning to the last shuffled values). The Shuffle button itself is the "regenerate everything" affordance.

### 6.2 WooCommerce

Display options that drive `formatReceiptData` and `encodeReceipt`:

| Field | Source | Notes |
|---|---|---|
| `currency` | `meta.currency` | dropdown, common WC currency codes |
| `currency_position` | format option | left, right, left-with-space, right-with-space |
| `decimals` | `EncodeReceiptOptions.decimals` | 0–4, default 2 |
| `decimal_separator` | format option | `.` or `,` |
| `thousand_separator` | format option | `,`, `.`, ` `, `'`, none |
| `locale` | `presentation_hints.locale` | dropdown, common locales (en_US, ar_SA, ja_JP, …) — also flips RTL |
| `prices_entered_with_tax` | `presentation_hints.prices_entered_with_tax` | toggle |
| `display_tax` | `presentation_hints.display_tax` | radio: incl / excl / hidden |
| `rounding_mode` | `presentation_hints.rounding_mode` | radio: per-line / per-total |
| `printer_model` | `EncodeReceiptOptions.printerModel` | dropdown, thermal templates only — Epson model variants |
| `language` | `EncodeReceiptOptions.language` | dropdown: esc-pos / star-prnt / star-line |

Last two are visually muted when current template is logicless (greyed out, no effect on render).

Layout: 2-column grid of compact field pairs; toggles inline at full width below.

### 6.3 Print

Two transports, matching the production subset that's possible in a browser app:

- **System print** — single button, calls `window.print()` against a re-rendered receipt-only document with paper-correct `@page` size. Same code path as the existing `openPrintDialog` flow but tightened.
- **Network printer (raw ESC/POS)** — only enabled for thermal engine. Fields:
  - `host` (default `127.0.0.1`)
  - `port` (default `9100`)
  - `Test connection` button — POSTs a 1-byte init (`ESC @`) to the dev endpoint to verify reachability.
  - `Send to printer` — primary CTA, ochre filled. Sends `encodeThermalTemplate(...)` bytes via the existing `printRawTcp` dev endpoint.
  - Last-send footer: `Last sent: 1.2KB · 165 lines · 0.3s · ✓` (or error state in red).
- **Inspect bytes** (collapsible, thermal only). Three columns:
  - **Hex** — `1B 40 1B 61 01 …`
  - **ASCII** — printable chars, dots for non-printable
  - **Decoded** — opcode lookup, e.g., `ESC @  init printer`, `ESC a 1  align center`. Decoder is a small lookup table over ESC/POS opcodes (~150 lines TS, decode-only, no encoder dependency).

## 7. Pipeline parity

Studio runs the **same chain** as production:

```
canonicalReceiptData          (from randomizer or editor state)
    │
    ▼
mapReceiptData()              (from @wcpos/printer)
    │
    ▼
formatReceiptData(...)        (locale, currency, decimals, separators applied)
    │
    ▼
renderLogiclessTemplate()     OR  renderThermalPreview() for screen
                              OR  encodeThermalTemplate() for bytes
```

Specific changes:

1. **Stop bypassing normalization.** Replace the current `renderStudioTemplate()` direct-render path with a call to a new shared helper `renderForStudio(template, canonicalData, settings)` that runs the full chain. Add this helper to `@wcpos/receipt-renderer` (or `@wcpos/printer`) so production and Studio can share it.
2. **Drop Studio-only logicless sanitization.** Production does not call `sanitizeHtml` after `renderLogiclessTemplate`. Studio currently does. Remove the Studio sanitization call so the rendered HTML matches byte-for-byte. Trust model is unchanged: templates are admin-controlled in WP. (See §13 for production-side concerns.)
3. **Use the canonical data shape end-to-end.** Studio internal state holds `ReceiptData` (numeric, untyped strings come from the formatter), not pre-formatted strings. The randomizer produces canonical data. The editor edits canonical data. The pipeline does the rest.

## 8. Phase 0 — Zod schema in `@wcpos/printer`

Prerequisite for the redesign. Adds runtime introspection that benefits both Studio and production.

- **Single source of truth:** `packages/printer/src/encoder/schema.ts` exports a Zod schema for every type in `encoder/types.ts`. The TypeScript types are derived: `export type ReceiptData = z.infer<typeof ReceiptDataSchema>`. The existing `types.ts` becomes a thin re-export.
- **Studio uses the schema for:**
  - Building the Fields tree (introspect Zod object shapes at runtime to produce section/field metadata).
  - Driving the randomizer (generate values that match each Zod type, with the array/optional patterns reflected).
  - Validating editor state on every change (surface inline errors).
- **Production benefits:**
  - REST boundary validation in `@wcpos/printer` hooks (parse responses through the schema; surface readable errors).
  - Better error messages in `mapReceiptData` and `formatReceiptData` (validate inputs early).
  - Templates can be statically checked against the schema (future work, not in this spec).
- **Migration path:** add the schema, derive types, leave existing call sites alone. Anywhere that previously accepted `ReceiptData` keeps working because the type is the same. Optional: drop `@wcpos/printer/src/encoder/types.ts` once schema is the source.

## 9. Randomizer

Core feature. Replaces the fixture concept entirely.

- **Implementation:** schema-aware generator that walks the `ReceiptDataSchema` and produces canonical-shape data. For unstructured strings, draws from curated pools (store names, customer names, product names — multilingual, including RTL Arabic and CJK samples).
- **Edge-case coverage.** The randomizer is weighted to produce variety over many shuffles. Each shuffle independently rolls for:
  - Cart size (1, 2, 5, 12, 30, 0 lines — empty cart at ~5%)
  - Refund (~10% — produces negative line totals and a refund-specific mode)
  - RTL locale (~10% — flips language pool to Arabic, currency to AED/SAR)
  - Multicurrency (~5% — store currency ≠ display currency)
  - Multi-payment split (~15% — 2–3 payments summing to total)
  - Fiscal data populated (~20% — produces qr_payload, immutable_id, sequence)
  - Long product names (~15% — single line with very long name)
  - Discounts and fees populated (~30%)
  - Shipping populated (~25%)
- **Determinism:** every shuffle uses a 32-bit seed (xorshift PRNG). Seed is shown in the Data section header next to the shuffle button. Clicking the seed copies it; pasting a seed sets it (so designers can reproduce shapes they liked).
- **Settings interaction:** the randomizer respects current WooCommerce settings (locale, currency, decimals). Changing settings does not re-shuffle; only re-formats the existing data through `formatReceiptData`.
- **Existing fixture files:** delete from `apps/template-studio/fixtures/`. Each was a one-shot scenario; randomizer covers all of them and more.

## 10. Paper-faithful preview

Two paper modes, both deterministic:

- **Thermal (58mm / 80mm):** receipt rendered to actual width in CSS pixels (1mm → 3.78px reference, plus a zoom factor). White paper, soft drop shadow, **torn bottom edge** (CSS zigzag mask). No visual gap between rows; line spacing matches production CSS.
- **A4:** full sheet rendered at scale. White paper, soft drop shadow, no torn edge. Visible margins indicated by a faint guide line.

Floating bottom pill: `paper-size · line-count · output-size`. For logicless, output-size shows `HTML` and the rendered DOM size; for thermal, it shows `ESC/POS bytes`.

## 11. Templates list

- Pulled from `woocommerce-pos/templates/gallery/` via the existing Vite plugin (`templateStudioPlugin`). No code changes here.
- Grouped by engine: "Logicless" (HTML/A4-style), "Thermal" (XML/ESC-POS).
- Click selects; selection persists across reloads via localStorage.
- Engine filter is removed (the grouping replaces it).

## 12. Removed

- `Engine` filter dropdown
- `Fixture` dropdown
- `Store URL`, `Template ID`, `Order ID` inputs and the `Fetch preview` button
- `Diagnostics` panel as a top-level pane (its content moves into Print → Inspect bytes for thermal; gone for logicless)
- `Status` text line (replaced by inline error states on individual sections)
- `apps/template-studio/fixtures/*.json` (retired; randomizer replaces)

The dev endpoints `printRawTcp` and the WP preview proxy: TCP endpoint stays (Print panel needs it); WP proxy can be removed because no in-app flow uses it.

## 13. Production-side concerns

Surfaced during the deep-dive. Not in scope of this spec but flagged for separate discussion.

1. **Sanitization asymmetry.** Production does not sanitize logicless HTML output. Studio currently does. This spec removes Studio's sanitization to achieve parity. **Open question: should production sanitize?** If yes, that's a separate change to `@wcpos/receipt-renderer` consumers. Recommendation: leave as-is, document the trust model (templates are admin-controlled).
2. **No runtime template validation.** Templates can reference fields that don't exist on `ReceiptData`; Mustache silently renders empty. The Phase 0 Zod schema enables future static checking of templates against the schema. Not in this spec.
3. **`@wcpos/printer/src/encoder/types.ts` vs `Receipt_Data_Schema.php`.** The PHP and TS contracts are aligned but maintained independently. Adding the Zod schema doesn't fix this. Future work: generate one from the other or share via a JSON Schema artifact.

## 14. Testing

- **Snapshot tests** (`apps/template-studio/snapshots/curated/`) retained but updated:
  - Use deterministic randomizer seeds (committed alongside snapshots).
  - Cover one snapshot per (template × seed × paper-width) combination, where seeds are chosen to exercise specific edge cases (`seed-empty-cart`, `seed-rtl`, `seed-refund`, `seed-fiscal`, `seed-long-names`, `seed-multi-payment`).
- **Parity tests** (new): for each template, render via the Studio's `renderForStudio` and via the production render path, compare. Lock parity in CI.
- **Schema tests** (new, in `@wcpos/printer`): every fixture, randomizer output, and `mapReceiptData` output validates against the Zod schema.
- **Visual regression** (out of scope): not adding playwright/Puppeteer screenshots. Existing `generate-gallery-previews` workflow continues for the gallery PNGs; that pipeline does not need to change.

## 15. Implementation phases

Sized to be each one or two PRs. Each phase ships green CI.

- **Phase 0 — Schema in `@wcpos/printer`.** Add Zod schema, derive types, validate fixtures, add schema tests. No Studio changes. Target: one PR. Independent value.
- **Phase 1 — Pipeline parity helper.** Add `renderForStudio` (or equivalent shared helper) that runs `mapReceiptData → formatReceiptData → render*`. Update Studio's `studio-core.ts` to use it. Drop Studio sanitization for logicless. Snapshot churn expected; update goldens.
- **Phase 2 — Randomizer + remove fixtures.** Implement schema-driven randomizer with seeded edge-case weights. Delete fixture JSON files. Update snapshot tests to use seeds.
- **Phase 3 — UI shell.** New layout (toolbar + left + canvas + right). Light theme. Templates list grouped by engine. Paper-faithful preview with torn thermal edge. Floating spec pill.
- **Phase 4 — Right panel: Data section.** Schema-driven Fields tree, search, inline expand, array editing, Shuffle button + seed display.
- **Phase 5 — Right panel: WooCommerce section.** All format/encode knobs surfaced.
- **Phase 6 — Right panel: Print section.** System print + network TCP + Inspect bytes (hex/ASCII/decoded). ESC/POS opcode decoder.
- **Phase 7 — Polish.** Empty/error states, accessibility pass, keyboard shortcuts (`⌘P` print, `⌘R` shuffle, `/` focus search).

Phases 0 and 1 are blockers. Phases 2–7 can interleave once those land. Phase 4 depends on the Zod schema being in place (Phase 0).

## 16. Open questions

- Should we expose a `Reset to defaults` button per WooCommerce setting? (Probably not; defaults reapply on next shuffle.)
- Should `Inspect bytes` decode CJK/Arabic codepage commands, or is generic ESC/POS enough? (Recommend: generic only in v1; codepage decoding only if real debugging proves it useful.)
- Should the seed be URL-encoded (so a designer can share a link to a specific data shape)? (Cheap to add; recommend yes.)

## 17. References

- `woocommerce-pos/includes/Services/Receipt_Data_Schema.php` — PHP canonical schema
- `monorepo-v2/packages/printer/src/encoder/types.ts` — TS canonical types (becomes derived from Zod after Phase 0)
- `monorepo-v2/packages/receipt-renderer/src/index.ts` — render exports
- `monorepo-v2/packages/printer/src/index.ts` — encode + format exports
- `woocommerce-pos/docs/superpowers/specs/2026-04-29-template-studio-design.md` — current Studio handoff
