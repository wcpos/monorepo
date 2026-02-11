# POS Product Grid/Tile View

**Issue:** https://github.com/wcpos/monorepo/issues/45
**Date:** 2026-02-12

## Summary

Add a grid/tile view as an alternative to the existing table view on the POS products screen. Users toggle between views via an icon button in the card header. The grid shows image-dominant product tiles with configurable fields and size.

## UI Settings Schema

New fields added to `pos-products` in `initial-settings.json`:

```json
{
  "pos-products": {
    "viewMode": "table",
    "gridColumns": 4,
    "gridFields": {
      "price": true,
      "tax": false,
      "on_sale": true,
      "category": true,
      "sku": false,
      "barcode": false,
      "stock_quantity": false,
      "cost_of_goods_sold": false
    }
  }
}
```

- `viewMode`: `"table"` | `"grid"` - persisted across sessions
- `gridColumns`: 2-8 integer, controls tile size via column count
- `gridFields`: toggles for which fields appear on each tile (image and name always show)

Existing fields (`sortBy`, `sortDirection`, `columns`, `metaDataKeys`, `showOutOfStock`) remain unchanged and apply to table mode only.

## Component Architecture

```
POSProducts (existing, modified)
├── CardHeader (unchanged - search, filters, settings)
│   └── + ViewModeToggle (new icon button)
├── CardContent
│   ├── if viewMode === "table" → DataTable (existing, unchanged)
│   └── if viewMode === "grid"  → ProductGrid (new)
│       └── VirtualizedList (existing, reused)
│           └── GridRow (renders N tiles per row)
│               └── ProductTile
│                   ├── ProductImage (existing, reused)
│                   ├── name, price, category, etc.
│                   └── VariableProductTile (wraps with popover)
└── Footer (existing, unchanged)
```

### New Files

Under `packages/core/src/screens/main/pos/products/`:

- `grid/index.tsx` - ProductGrid, wires VirtualizedList with chunked grid data
- `grid/product-tile.tsx` - Single tile (image, name, configurable fields)
- `grid/variable-product-tile.tsx` - Wraps tile with variations popover trigger
- `grid/grid-row.tsx` - Renders a row of N tiles (one VirtualizedList item = one row)
- `view-mode-toggle.tsx` - Header icon toggle button

### Unchanged

- Query, search, filter bar, barcode scanning all stay the same regardless of view mode
- Only the rendering layer inside CardContent changes

## Grid Rendering

The `ProductGrid` chunks the flat product list into rows of N items (where N = `gridColumns`) and feeds them to the existing `VirtualizedList`. This reuses the same virtualization layer (FlashList on native, TanStack Virtual on web) without needing separate grid implementations.

The last row pads with empty spacers if fewer than N products remain.

Tile aspect ratio is roughly 1:1. Actual pixel size = `containerWidth / gridColumns` minus gap spacing.

## Tile Layout

Image-dominant design. The image area fills ~60-70% of the tile. The text area below flexes based on how many fields are enabled - fewer fields means bigger image.

Default appearance (price, on_sale, category enabled):

```
┌─────────────┐
│             │
│   Product   │
│    Image    │
│             │
├─────────────┤
│ Product Name│
│ $29.99      │
│ Clothing    │
└─────────────┘
```

With all fields enabled:

```
┌─────────────┐
│             │
│   Product   │
│    Image    │
│             │
├─────────────┤
│ Product Name│
│ $29.99 $24.99│  ← on_sale: strikethrough + sale price
│ incl. $3 tax│  ← tax
│ SKU: ABC-123│  ← sku
│ Clothing    │  ← category
│ Stock: 15   │  ← stock_quantity
│ COGS: $12   │  ← cost_of_goods_sold
└─────────────┘
```

## Variable Products

- Tapping a simple product tile calls `useAddProduct` directly (same as current action button)
- Tapping a variable product tile opens the existing variations popover, anchored to the tile center (with positioning tweaks for larger anchor)
- Variable products show a subtle visual indicator (small stacked-cards/layers icon overlay on the image corner)
- Popover content (attribute buttons, select dropdowns, add-to-cart) is reused as-is

## View Mode Toggle

Single `IconButton` in the CardHeader HStack, between search input and settings gear:

```
[Search products...              ] [⊞] [⚙]
```

- Table mode: shows grid icon (switch to grid)
- Grid mode: shows list icon (switch to table)
- On press: `patchUI({ viewMode: newMode })`
- Uses `lucide-react-native` icons

## UI Settings Form

The form in `ui-settings-form.tsx` adapts based on `viewMode`:

**Table mode** (unchanged):
- showOutOfStock toggle
- Column visibility/ordering
- metaDataKeys input

**Grid mode:**
- showOutOfStock toggle
- Tile size slider (gridColumns: 2-8)
- Tile field toggles (price, tax, on_sale, category, sku, barcode, stock_quantity, cost_of_goods_sold)
- Column settings and metaDataKeys hidden (not applicable)

## Scope

This feature applies to the **POS products screen only** (`pos-products` UI settings). The products management screen, orders, customers, etc. remain table-only.
