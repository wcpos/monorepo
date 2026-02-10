# Generic Combobox Option Type

## Problem

The Combobox component was built to mimic Radix Select — it takes `{value, label}` pairs and outputs a `{value, label}` on selection. But some consumers (specifically the customer search in the POS cart) need to pass complex data (RxDB documents) through and get the typed object back on selection.

Today this is hacked around with an `item?: unknown` field on the `Option` type. Consumers cast through `unknown` (`option.item as CustomerDocument`), which is unsafe and obscures intent.

## Design

### Generic Option Type

```ts
// packages/components/src/combobox/types.ts

interface Option<T = undefined> {
  value: string;
  label: string;
  item?: T;
}
```

Key decisions:

- **Default generic is `undefined`**, not `unknown`. Consumers that don't pass a generic arg get `item?: undefined` — they can't accidentally access it without opting in.
- **`value` narrows to `string` only.** Both Radix (web) and React Native primitives use strings. The previous `string | number` union created coercion headaches. Callers should `String(id)` at the boundary.
- **`item` stays optional.** Most comboboxes (country, state, form selects) never set it.
- **Cross-platform safe.** `Option<T>` is a plain JS object with no platform dependencies. A single callback shape works identically on web and React Native.

### Component Changes

#### `ComboboxRootContextType` (internal)

```ts
interface ComboboxRootContextType {
  value: Option<any> | undefined;
  onValueChange: (option: Option<any> | undefined) => void;
  disabled?: boolean;
  filterValue: string;
  onFilterChange: (text: string) => void;
}
```

React's `createContext` can't be generic at the call site, so the context uses `any` internally. Type safety is enforced at the public component API boundary.

#### `ComboboxItem` (bug fix)

Today `ComboboxItem` drops `item` from the callback:

```tsx
// Before — item is lost
onValueChange({ value, label } as Option);
```

Fixed to include it:

```tsx
// After — item flows through
onValueChange({ value, label, item });
```

This is the actual bug. The generic typing is a correctness improvement on top.

#### `Combobox` (root)

Public signature becomes generic:

```tsx
function Combobox<T = undefined>({
  onValueChange,
  value,
  ...props
}: ComboboxRootProps<T>) { ... }
```

### Consumer Changes

#### Simple comboboxes — no change

Country, state, form selects continue working as-is. `Option<undefined>` is inferred, `item` doesn't exist in the type.

#### `cart-header.tsx` — cast removed

```tsx
// Before
const handleSelectCustomer = async (option: Option | undefined) => {
  if (option?.item) {
    await addCustomer(option.item as CustomerDocument); // unsafe cast
  }
};

// After
const handleSelectCustomer = async (option: Option<CustomerDocument> | undefined) => {
  if (option?.item) {
    await addCustomer(option.item); // typed, no cast
  }
};
```

With the generic on the Combobox:

```tsx
<Combobox<CustomerDocument> onValueChange={handleSelectCustomer}>
```

#### `customer-pill.tsx` — no change

Only uses `option.value` (string ID for query filtering).

#### Order edit form — no change

Goes through `FormCombobox`, only uses string value.

### Files Changed

1. `packages/components/src/combobox/types.ts` — generic Option type, narrow value to string
2. `packages/components/src/combobox/combobox.tsx` — include `item` in onValueChange call, generic component signatures
3. `packages/core/src/screens/main/pos/cart/cart-header.tsx` — typed callback, remove cast

### Files NOT Changed

- `customer-pill.tsx` (uses `option.value` only)
- Order edit form (uses `FormCombobox` with string value)
- Country/state comboboxes (simple value/label)
- Select component (different tier — static dropdowns, no search, no complex objects)

## Future Refactor Note

Three places independently compose `<Combobox>` + `<CustomerSearch>` with different trigger presentations (pill with remove button, form field, pill with delayed open). A headless `CustomerPicker` accepting a custom trigger could deduplicate this, but each usage has different enough display logic that it's not a clear win today. Revisit when a fourth consumer appears or the existing ones converge.
