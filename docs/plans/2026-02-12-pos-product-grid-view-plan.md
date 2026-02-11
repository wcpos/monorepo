# POS Product Grid/Tile View - Implementation Plan

> **For Claude:** REQUIRED: Use /execute-plan to implement this plan task-by-task.

**Goal:** Add a grid/tile view toggle to the POS products screen so cashiers can switch between the existing table view and an image-dominant grid view.

**Architecture:** The POSProducts component conditionally renders either the existing DataTable or a new ProductGrid based on a `viewMode` UI setting. The grid reuses the existing VirtualizedList (FlashList native / TanStack Virtual web) by chunking products into rows of N tiles. All query, search, and filter logic stays untouched.

**Tech Stack:** React Native, TanStack Virtual (web), FlashList (native), RxDB state, observable-hooks, Tailwind/Uniwind, react-hook-form + zod, @rn-primitives/slider

**Design doc:** `docs/plans/2026-02-12-pos-product-grid-view-design.md`

**Worktree:** `.worktrees/pos-grid-view` on branch `feature/pos-grid-view`

---

## Task 1: Add new UI settings fields to initial-settings.json

**Files:**
- Modify: `packages/core/src/screens/main/contexts/ui-settings/initial-settings.json` (lines 2-101, the `pos-products` block)

**Step 1: Add viewMode, gridColumns, and gridFields to pos-products settings**

Add three new fields after the existing `"position": "left"` line (line 6) in the `pos-products` object:

```json
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
},
```

These go right after `"position": "left",` and before `"columns": [`.

**Step 2: Verify TypeScript still infers the types correctly**

Run: `cd .worktrees/pos-grid-view && pnpm --filter @wcpos/core exec tsc --noEmit 2>&1 | head -30`

The `UISettingSchema<'pos-products'>` type is inferred from the JSON import, so adding new fields should just work. If there are pre-existing type errors, that's fine - just confirm no NEW errors related to viewMode/gridColumns/gridFields.

**Step 3: Commit**

```bash
git add packages/core/src/screens/main/contexts/ui-settings/initial-settings.json
git commit -m "feat(pos): add viewMode, gridColumns, gridFields to pos-products settings"
```

---

## Task 2: Create the ViewModeToggle component

**Files:**
- Create: `packages/core/src/screens/main/pos/products/view-mode-toggle.tsx`

**Context:** The `IconButton` component is at `@wcpos/components/icon-button`. Available icon names include `grid` and `list` (from `packages/components/src/icon/components/fontawesome/solid/`). The `useUISettings` hook returns `{ uiSettings, patchUI }`. Individual fields are observed via `useObservableEagerState(uiSettings.fieldName$)`.

**Step 1: Create the toggle component**

```tsx
import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { IconButton } from '@wcpos/components/icon-button';

import { useUISettings } from '../../contexts/ui-settings';

export function ViewModeToggle() {
	const { uiSettings, patchUI } = useUISettings('pos-products');
	const viewMode = useObservableEagerState(uiSettings.viewMode$);

	const handlePress = React.useCallback(() => {
		patchUI({ viewMode: viewMode === 'table' ? 'grid' : 'table' });
	}, [patchUI, viewMode]);

	return (
		<IconButton
			name={viewMode === 'table' ? 'grid' : 'list'}
			onPress={handlePress}
			testID="view-mode-toggle"
		/>
	);
}
```

**Step 2: Commit**

```bash
git add packages/core/src/screens/main/pos/products/view-mode-toggle.tsx
git commit -m "feat(pos): add ViewModeToggle component"
```

---

## Task 3: Create the ProductTile component

**Files:**
- Create: `packages/core/src/screens/main/pos/products/grid/product-tile.tsx`

**Context:**
- `useImageAttachment` is at `../../hooks/use-image-attachment` (relative to `components/product/`)  but from the grid directory it will be `../../../hooks/use-image-attachment`
- `Image` component is at `@wcpos/components/image`
- `PriceWithTax` is at `../../../components/product/price-with-tax`
- `useAddProduct` is at `../../hooks/use-add-product`
- `useCurrencyFormat` is at `../../../hooks/use-currency-format`
- Product observables: `product.name$`, `product.price$`, `product.regular_price$`, `product.on_sale$`, `product.images$`, `product.sku$`, `product.barcode$`, `product.tax_status$`, `product.tax_class$`, `product.categories$`
- `useObservableEagerState` from `observable-hooks` subscribes to these

**Step 1: Create the tile component**

The tile receives a product document and gridFields config. It renders an image-dominant card with configurable text fields below.

```tsx
import * as React from 'react';
import { Pressable, View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useAddProduct } from '../../hooks/use-add-product';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface GridFields {
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

interface ProductTileProps {
	product: ProductDocument;
	gridFields: GridFields;
}

export function ProductTile({ product, gridFields }: ProductTileProps) {
	const { addProduct } = useAddProduct();
	const { format } = useCurrencyFormat();
	const name = useObservableEagerState(product.name$!);
	const images = useObservableEagerState(product.images$!);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri, error } = useImageAttachment(product, imageURL ?? '');
	const price = useObservableEagerState(product.price$!);
	const regularPrice = useObservableEagerState(product.regular_price$!);
	const onSale = useObservableEagerState(product.on_sale$!);
	const taxStatus = useObservableEagerState(product.tax_status$!);
	const taxClass = useObservableEagerState(product.tax_class$!);
	const categories = useObservableEagerState(product.categories$!) || [];
	const sku = useObservableEagerState(product.sku$!);
	const barcode = useObservableEagerState(product.barcode$!);
	const stockQuantity = useObservableEagerState(product.stock_quantity$!);

	const imageSource = error
		? { uri: 'https://via.placeholder.com/150' }
		: { uri };

	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('tooltip' as const);
	const showOnSale = gridFields.on_sale && onSale;

	const handlePress = React.useCallback(() => {
		addProduct(product);
	}, [addProduct, product]);

	return (
		<Pressable
			onPress={handlePress}
			className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border"
			testID="product-tile"
		>
			<View className="aspect-square">
				<Image
					source={imageSource}
					recyclingKey={product.uuid}
					className="h-full w-full"
				/>
				{product.type === 'variable' && (
					<View className="bg-black/50 absolute right-1 top-1 rounded px-1 py-0.5">
						<Text className="text-xs text-white">Variants</Text>
					</View>
				)}
			</View>
			<VStack className="p-2" space="xs">
				<Text className="font-bold" numberOfLines={2} decodeHtml>
					{name}
				</Text>
				{gridFields.price && (
					<>
						{showOnSale ? (
							<VStack space="xs">
								<PriceWithTax
									price={regularPrice ?? ''}
									taxStatus={safeTaxStatus}
									taxClass={taxClass ?? ''}
									taxDisplay={taxDisplay}
									strikethrough
								/>
								<PriceWithTax
									price={price ?? ''}
									taxStatus={safeTaxStatus}
									taxClass={taxClass ?? ''}
									taxDisplay={taxDisplay}
								/>
							</VStack>
						) : (
							<PriceWithTax
								price={price ?? ''}
								taxStatus={safeTaxStatus}
								taxClass={taxClass ?? ''}
								taxDisplay={taxDisplay}
							/>
						)}
					</>
				)}
				{gridFields.sku && sku ? (
					<Text className="text-muted-foreground text-xs">SKU: {sku}</Text>
				) : null}
				{gridFields.barcode && barcode ? (
					<Text className="text-muted-foreground text-xs">Barcode: {barcode}</Text>
				) : null}
				{gridFields.category && categories.length > 0 && (
					<Text className="text-muted-foreground text-xs" numberOfLines={1} decodeHtml>
						{categories.map((c: { name: string }) => c.name).join(', ')}
					</Text>
				)}
				{gridFields.stock_quantity && stockQuantity != null && (
					<Text className="text-muted-foreground text-xs">Stock: {stockQuantity}</Text>
				)}
				{gridFields.cost_of_goods_sold && product.cost_of_goods_sold ? (
					<Text className="text-muted-foreground text-xs">
						COGS: {format(Number(product.cost_of_goods_sold))}
					</Text>
				) : null}
			</VStack>
		</Pressable>
	);
}
```

**Step 2: Commit**

```bash
git add packages/core/src/screens/main/pos/products/grid/product-tile.tsx
git commit -m "feat(pos): add ProductTile component for grid view"
```

---

## Task 4: Create the VariableProductTile component

**Files:**
- Create: `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx`

**Context:**
- The existing `VariationsPopover` component is at `../cells/variations-popover` and takes `{ parent, addToCart }` props
- The `useAddVariation` hook is at `../../hooks/use-add-variation`
- `Popover`, `PopoverTrigger`, `PopoverContent` are at `@wcpos/components/popover`
- This wraps a ProductTile-like layout but opens the variations popover instead of adding directly to cart

**Step 1: Create the variable product tile**

```tsx
import * as React from 'react';
import { Pressable, View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { VariationsPopover } from '../cells/variations-popover';
import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useAddVariation } from '../../hooks/use-add-variation';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface MetaData {
	attr_id: number;
	display_key?: string;
	display_value?: string;
}

interface GridFields {
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

interface VariableProductTileProps {
	product: ProductDocument;
	gridFields: GridFields;
}

export function VariableProductTile({ product, gridFields }: VariableProductTileProps) {
	const { addVariation } = useAddVariation();
	const { format } = useCurrencyFormat();
	const triggerRef = React.useRef<{ close: () => void } | null>(null);

	const name = useObservableEagerState(product.name$!);
	const images = useObservableEagerState(product.images$!);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri, error } = useImageAttachment(product, imageURL ?? '');
	const price = useObservableEagerState(product.price$!);
	const regularPrice = useObservableEagerState(product.regular_price$!);
	const onSale = useObservableEagerState(product.on_sale$!);
	const taxStatus = useObservableEagerState(product.tax_status$!);
	const taxClass = useObservableEagerState(product.tax_class$!);
	const categories = useObservableEagerState(product.categories$!) || [];
	const sku = useObservableEagerState(product.sku$!);
	const barcode = useObservableEagerState(product.barcode$!);
	const stockQuantity = useObservableEagerState(product.stock_quantity$!);

	const imageSource = error
		? { uri: 'https://via.placeholder.com/150' }
		: { uri };

	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('tooltip' as const);
	const showOnSale = gridFields.on_sale && onSale;

	const addToCart = React.useCallback(
		(variation: ProductVariationDocument | ProductDocument, metaData: MetaData[]) => {
			addVariation(variation as ProductVariationDocument, product, metaData);
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[addVariation, product]
	);

	return (
		<Popover>
			<PopoverTrigger ref={triggerRef as React.RefObject<never>} asChild>
				<Pressable
					className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border"
					testID="variable-product-tile"
				>
					<View className="aspect-square">
						<Image
							source={imageSource}
							recyclingKey={product.uuid}
							className="h-full w-full"
						/>
						<View className="bg-black/50 absolute right-1 top-1 rounded px-1 py-0.5">
							<Text className="text-xs text-white">Variants</Text>
						</View>
					</View>
					<VStack className="p-2" space="xs">
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{name}
						</Text>
						{gridFields.price && (
							<>
								{showOnSale ? (
									<VStack space="xs">
										<PriceWithTax
											price={regularPrice ?? ''}
											taxStatus={safeTaxStatus}
											taxClass={taxClass ?? ''}
											taxDisplay={taxDisplay}
											strikethrough
										/>
										<PriceWithTax
											price={price ?? ''}
											taxStatus={safeTaxStatus}
											taxClass={taxClass ?? ''}
											taxDisplay={taxDisplay}
										/>
									</VStack>
								) : (
									<PriceWithTax
										price={price ?? ''}
										taxStatus={safeTaxStatus}
										taxClass={taxClass ?? ''}
										taxDisplay={taxDisplay}
									/>
								)}
							</>
						)}
						{gridFields.sku && sku ? (
							<Text className="text-muted-foreground text-xs">SKU: {sku}</Text>
						) : null}
						{gridFields.barcode && barcode ? (
							<Text className="text-muted-foreground text-xs">Barcode: {barcode}</Text>
						) : null}
						{gridFields.category && categories.length > 0 && (
							<Text className="text-muted-foreground text-xs" numberOfLines={1} decodeHtml>
								{categories.map((c: { name: string }) => c.name).join(', ')}
							</Text>
						)}
						{gridFields.stock_quantity && stockQuantity != null && (
							<Text className="text-muted-foreground text-xs">Stock: {stockQuantity}</Text>
						)}
						{gridFields.cost_of_goods_sold && product.cost_of_goods_sold ? (
							<Text className="text-muted-foreground text-xs">
								COGS: {format(Number(product.cost_of_goods_sold))}
							</Text>
						) : null}
					</VStack>
				</Pressable>
			</PopoverTrigger>
			<PopoverContent side="bottom" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={product} addToCart={addToCart as never} />
			</PopoverContent>
		</Popover>
	);
}
```

**Step 2: Commit**

```bash
git add packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx
git commit -m "feat(pos): add VariableProductTile with popover for grid view"
```

---

## Task 5: Create the ProductGrid component

**Files:**
- Create: `packages/core/src/screens/main/pos/products/grid/index.tsx`

**Context:**
- `VirtualizedList` is at `@wcpos/components/virtualized-list` with `Root`, `List`, and `Item` exports
- The grid chunks products into rows of N and renders each row as a VirtualizedList item
- Product data comes from a query's `resource` (ObservableResource), same as DataTable
- `useObservableSuspense` reads the resource; `useObservableEagerState` reads individual fields
- `DataTableFooter` is at `../../components/data-table/footer`
- Look at `packages/core/src/screens/main/components/data-table/index.tsx` for how the DataTable uses VirtualizedList and query - follow the same patterns

**Step 1: Create the grid component**

```tsx
import * as React from 'react';
import { View } from 'react-native';

import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';

import { Text } from '@wcpos/components/text';
import * as VirtualizedList from '@wcpos/components/virtualized-list';
import type { Query } from '@wcpos/query';

import { ProductTile } from './product-tile';
import { VariableProductTile } from './variable-product-tile';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { DataTableFooter } from '../../../components/data-table/footer';
import { TaxBasedOn } from '../../../components/product/tax-based-on';
import { useTaxRates } from '../../../contexts/tax-rates';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface ProductGridProps {
	query: Query<any>;
}

interface GridFields {
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

export function ProductGrid({ query }: ProductGridProps) {
	const { uiSettings } = useUISettings('pos-products');
	const gridColumns = useObservableEagerState(uiSettings.gridColumns$);
	const gridFields = useObservableEagerState(uiSettings.gridFields$) as GridFields;
	const { calcTaxes } = useTaxRates();
	const t = useT();

	const result = useObservableSuspense(query.resource);
	const deferredResult = React.useDeferredValue(result);

	/**
	 * Chunk flat product list into rows of N
	 */
	const rows = React.useMemo(() => {
		const products = deferredResult.hits.map(
			(hit: { document: ProductDocument }) => hit.document
		);
		const chunked: ProductDocument[][] = [];
		for (let i = 0; i < products.length; i += gridColumns) {
			chunked.push(products.slice(i, i + gridColumns));
		}
		return chunked;
	}, [deferredResult.hits, gridColumns]);

	return (
		<View className="flex h-full flex-col">
			<VirtualizedList.Root style={{ flex: 1 }}>
				<VirtualizedList.List
					data={rows}
					renderItem={({ item: row }) => (
						<VirtualizedList.Item>
							<View className="flex-row">
								{row.map((product: ProductDocument) => (
									product.type === 'variable' ? (
										<VariableProductTile
											key={product.uuid}
											product={product}
											gridFields={gridFields}
										/>
									) : (
										<ProductTile
											key={product.uuid}
											product={product}
											gridFields={gridFields}
										/>
									)
								))}
								{/* Spacers for incomplete last row */}
								{row.length < gridColumns &&
									Array.from({ length: gridColumns - row.length }).map((_, i) => (
										<View key={`spacer-${i}`} className="m-1 flex-1" />
									))}
							</View>
						</VirtualizedList.Item>
					)}
					estimatedItemSize={200}
					onEndReachedThreshold={0.1}
					onEndReached={() => {
						if (query.infiniteScroll) {
							query.loadMore();
						}
					}}
					ListEmptyComponent={() => (
						<View className="items-center justify-center p-4">
							<Text testID="no-data-message">
								{t('common.no_products_found')}
							</Text>
						</View>
					)}
				/>
			</VirtualizedList.Root>
			<View className="border-border border-t">
				{calcTaxes ? (
					<DataTableFooter query={query} count={deferredResult.hits.length}>
						<TaxBasedOn />
					</DataTableFooter>
				) : (
					<DataTableFooter query={query} count={deferredResult.hits.length} />
				)}
			</View>
		</View>
	);
}
```

**Step 2: Commit**

```bash
git add packages/core/src/screens/main/pos/products/grid/index.tsx
git commit -m "feat(pos): add ProductGrid component with chunked virtualized rendering"
```

---

## Task 6: Wire up ViewModeToggle and ProductGrid in POSProducts

**Files:**
- Modify: `packages/core/src/screens/main/pos/products/index.tsx`

**Context:** The POSProducts component currently always renders DataTable. We need to:
1. Import ViewModeToggle and ProductGrid
2. Read `viewMode` from UI settings
3. Add the toggle to the CardHeader HStack
4. Conditionally render DataTable or ProductGrid in CardContent

**Step 1: Add imports**

Add these imports near the top of the file, after the existing imports:

```tsx
import { ViewModeToggle } from './view-mode-toggle';
import { ProductGrid } from './grid';
```

**Step 2: Read viewMode from settings**

Inside the `POSProducts` function, after `const showOutOfStock = useObservableEagerState(uiSettings.showOutOfStock$);` (line 133), add:

```tsx
const viewMode = useObservableEagerState(uiSettings.viewMode$);
```

**Step 3: Add ViewModeToggle to CardHeader**

In the JSX, in the `<HStack>` inside `<CardHeader>` (around line 232), add the toggle between the search input ErrorBoundary and the UISettingsDialog:

Change:
```tsx
</ErrorBoundary>
<UISettingsDialog title={t('common.product_settings')}>
```

To:
```tsx
</ErrorBoundary>
<ViewModeToggle />
<UISettingsDialog title={t('common.product_settings')}>
```

**Step 4: Conditionally render DataTable or ProductGrid**

Replace the CardContent contents. Change the block at lines 253-269 from:

```tsx
<CardContent className="border-border flex-1 border-t p-0">
	<ErrorBoundary>
		<Suspense>
			<DataTable<ProductDocument>
				id="pos-products"
				query={query!}
				renderItem={renderItem}
				renderCell={renderCell}
				noDataMessage={t('common.no_products_found')}
				estimatedItemSize={100}
				TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
				getItemType={(row) => row.original.document.type}
				tableConfig={tableConfig}
			/>
		</Suspense>
	</ErrorBoundary>
</CardContent>
```

To:

```tsx
<CardContent className="border-border flex-1 border-t p-0">
	<ErrorBoundary>
		<Suspense>
			{viewMode === 'grid' ? (
				<ProductGrid query={query!} />
			) : (
				<DataTable<ProductDocument>
					id="pos-products"
					query={query!}
					renderItem={renderItem}
					renderCell={renderCell}
					noDataMessage={t('common.no_products_found')}
					estimatedItemSize={100}
					TableFooterComponent={calcTaxes ? TableFooter : DataTableFooter}
					getItemType={(row) => row.original.document.type}
					tableConfig={tableConfig}
				/>
			)}
		</Suspense>
	</ErrorBoundary>
</CardContent>
```

**Step 5: Commit**

```bash
git add packages/core/src/screens/main/pos/products/index.tsx
git commit -m "feat(pos): wire up grid/table toggle in POSProducts"
```

---

## Task 7: Create a Slider component for the settings form

**Files:**
- Create: `packages/components/src/slider/index.tsx`

**Context:** The `@rn-primitives/slider` package (v1.2.0) is already in `packages/components/package.json` dependencies. We need a thin wrapper that follows the project's component patterns. Check how other rn-primitives wrappers are built (e.g. the Switch or Checkbox components in `packages/components/src/switch/` or `packages/components/src/checkbox/`).

Before writing, read one existing rn-primitives wrapper to match the pattern:

```bash
cat packages/components/src/switch/index.tsx
```

**Step 1: Create the Slider component**

Create a simple Slider that wraps `@rn-primitives/slider` with Tailwind styling:

```tsx
import * as React from 'react';
import { View } from 'react-native';

import * as SliderPrimitive from '@rn-primitives/slider';

import { cn } from '../lib/utils';

interface SliderProps {
	value: number;
	onValueChange: (value: number) => void;
	min?: number;
	max?: number;
	step?: number;
	className?: string;
}

function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className }: SliderProps) {
	return (
		<SliderPrimitive.Root
			value={[value]}
			onValueChange={(values: number[]) => onValueChange(values[0])}
			min={min}
			max={max}
			step={step}
			className={cn('flex-row items-center', className)}
		>
			<SliderPrimitive.Track className="bg-muted relative h-2 w-full rounded-full">
				<SliderPrimitive.Range className="bg-primary absolute h-full rounded-full" />
			</SliderPrimitive.Track>
			<SliderPrimitive.Thumb className="bg-background border-primary block h-5 w-5 rounded-full border-2 shadow" />
		</SliderPrimitive.Root>
	);
}

export { Slider };
```

**Important:** The exact API of `@rn-primitives/slider` may differ. Check the actual package before implementing:

```bash
cat node_modules/@rn-primitives/slider/dist/index.d.ts 2>/dev/null || cat .worktrees/pos-grid-view/node_modules/@rn-primitives/slider/dist/index.d.ts 2>/dev/null
```

Adjust the implementation to match the actual API.

**Step 2: Commit**

```bash
git add packages/components/src/slider/index.tsx
git commit -m "feat(components): add Slider component wrapping @rn-primitives/slider"
```

---

## Task 8: Update the UISettingsForm for grid mode

**Files:**
- Modify: `packages/core/src/screens/main/pos/products/ui-settings-form.tsx`

**Context:** The form currently shows showOutOfStock, columns config, and metaDataKeys. When `viewMode` is `grid`, we need to show:
- showOutOfStock (same)
- gridColumns slider (2-8)
- gridFields toggles (price, tax, on_sale, category, sku, barcode, stock_quantity, cost_of_goods_sold)
- Hide columns config and metaDataKeys

The form uses react-hook-form with zod validation. `useFormChangeHandler` auto-saves changes to RxDB via `patchUI`.

**Step 1: Update the schema to include new fields**

Change the schema definition at lines 24-28:

```tsx
const gridFieldsSchema = z.object({
	price: z.boolean(),
	tax: z.boolean(),
	on_sale: z.boolean(),
	category: z.boolean(),
	sku: z.boolean(),
	barcode: z.boolean(),
	stock_quantity: z.boolean(),
	cost_of_goods_sold: z.boolean(),
});

export const schema = z.object({
	viewMode: z.enum(['table', 'grid']),
	showOutOfStock: z.boolean(),
	...columnsFormSchema.shape,
	metaDataKeys: z.string().optional(),
	gridColumns: z.number().min(2).max(8),
	gridFields: gridFieldsSchema,
});
```

**Step 2: Add imports for Slider and watch viewMode**

Add imports:

```tsx
import { Slider } from '@wcpos/components/slider';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
```

**Step 3: Update the form JSX to conditionally render by viewMode**

Inside the `UISettingsForm` function, after the `useFormChangeHandler` call, add:

```tsx
const viewMode = form.watch('viewMode');
```

Then update the return JSX to conditionally show grid or table settings:

```tsx
return (
	<VStack>
		<Form {...form}>
			<VStack>
				<FormField
					control={form.control}
					name="showOutOfStock"
					render={({ field }) => <FormSwitch label={getUILabel('showOutOfStock')} {...field} />}
				/>
				{viewMode === 'grid' ? (
					<>
						<FormField
							control={form.control}
							name="gridColumns"
							render={({ field }) => (
								<VStack space="xs">
									<HStack className="items-center justify-between">
										<Text className="text-sm font-medium">{getUILabel('gridColumns')}</Text>
										<Text className="text-muted-foreground text-sm">{field.value}</Text>
									</HStack>
									<Slider
										value={field.value}
										onValueChange={field.onChange}
										min={2}
										max={8}
										step={1}
									/>
								</VStack>
							)}
						/>
						<VStack space="xs">
							<Text className="text-sm font-medium">{getUILabel('gridFields')}</Text>
							<FormField
								control={form.control}
								name="gridFields.price"
								render={({ field }) => <FormSwitch label={getUILabel('price')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.tax"
								render={({ field }) => <FormSwitch label={getUILabel('tax')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.on_sale"
								render={({ field }) => <FormSwitch label={getUILabel('on_sale')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.category"
								render={({ field }) => <FormSwitch label={getUILabel('category')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.sku"
								render={({ field }) => <FormSwitch label={getUILabel('sku')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.barcode"
								render={({ field }) => <FormSwitch label={getUILabel('barcode')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.stock_quantity"
								render={({ field }) => <FormSwitch label={getUILabel('stock_quantity')} {...field} />}
							/>
							<FormField
								control={form.control}
								name="gridFields.cost_of_goods_sold"
								render={({ field }) => <FormSwitch label={getUILabel('cost_of_goods_sold')} {...field} />}
							/>
						</VStack>
					</>
				) : (
					<>
						<UISettingsColumnsForm columns={initialData.columns} getUILabel={getUILabel} />
						<FormField
							control={form.control}
							name="metaDataKeys"
							render={({ field }) => (
								<FormInput
									label={getUILabel('metaDataKeys')}
									description={t('pos_products.a_list_of_product_meta_keys')}
									{...field}
								/>
							)}
						/>
					</>
				)}
			</VStack>
		</Form>
	</VStack>
);
```

**Step 4: Commit**

```bash
git add packages/core/src/screens/main/pos/products/ui-settings-form.tsx
git commit -m "feat(pos): adapt settings form for grid mode (slider, field toggles)"
```

---

## Task 9: Add translation labels for new settings

**Files:**
- Check: `packages/core/src/screens/main/contexts/ui-settings/use-ui-label.ts` (or similar)

**Context:** The `getUILabel` function returns human-readable labels for settings keys. We need to make sure labels exist for `viewMode`, `gridColumns`, `gridFields`, and all the grid field sub-keys (`price`, `tax`, `on_sale`, `category`, etc.).

**Step 1: Find where labels are defined**

```bash
grep -r "getLabel\|uiLabel\|gridColumns\|viewMode" packages/core/src/screens/main/contexts/ui-settings/ --include="*.ts" --include="*.tsx"
```

Read the label file and add entries for the new keys. If labels come from translations, add them there. If they're hardcoded in a map, add to that map.

**Step 2: Add labels for all new settings keys**

Add appropriate labels like:
- `viewMode` → "View Mode"
- `gridColumns` → "Tile Size"
- `gridFields` → "Tile Fields"
- The individual grid field keys likely already have labels from the column settings (price, sku, etc.)

**Step 3: Commit**

```bash
git add -A
git commit -m "feat(pos): add translation labels for grid view settings"
```

---

## Task 10: Lint, typecheck, and test

**Step 1: Run lint**

```bash
cd .worktrees/pos-grid-view && pnpm lint:fix 2>&1 | tail -30
```

Fix any lint errors. Common issues:
- Import ordering (the eslint config enforces sorted imports)
- Unused imports
- Missing `* as React` namespace import style

**Step 2: Run typecheck**

```bash
pnpm --filter @wcpos/core exec tsc --noEmit 2>&1 | tail -30
```

Fix any type errors. Common issues:
- Observable property types (e.g. `uiSettings.viewMode$` might need a type assertion if the JSON inference is too wide)
- The `gridFields` type might need to be cast

**Step 3: Run tests**

```bash
pnpm test 2>&1 | tail -30
```

Confirm no new test failures beyond the pre-existing ones.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address lint and type errors for grid view feature"
```

---

## Task 11: Manual smoke test and visual polish

**Step 1: Start the dev server**

```bash
cd .worktrees/pos-grid-view && pnpm dev:main
```

**Step 2: Verify these behaviors**

- [ ] Toggle button appears in the POS products header between search and settings gear
- [ ] Clicking toggle switches between table and grid views
- [ ] Grid shows product tiles with images, names, and default fields (price, on_sale, category)
- [ ] Tapping a simple product tile adds it to cart
- [ ] Tapping a variable product tile opens the variations popover
- [ ] The "Variants" badge appears on variable product tiles
- [ ] Opening settings in grid mode shows: showOutOfStock, gridColumns slider, gridFields toggles
- [ ] Opening settings in table mode shows the original column settings
- [ ] Slider changes the number of columns (tiles resize)
- [ ] Toggling grid fields shows/hides info on tiles
- [ ] View mode persists across page navigations
- [ ] Empty state ("No products found") works in grid mode
- [ ] Infinite scroll loads more products in grid mode

**Step 3: Fix any visual issues**

Adjust Tailwind classes as needed for:
- Tile spacing and border radius
- Text truncation
- Image aspect ratio
- Popover positioning on variable product tiles

**Step 4: Commit polish**

```bash
git add -A
git commit -m "fix(pos): visual polish for grid view tiles and settings"
```

---

## Summary of new/modified files

| Action | File |
|--------|------|
| Modify | `packages/core/src/screens/main/contexts/ui-settings/initial-settings.json` |
| Create | `packages/core/src/screens/main/pos/products/view-mode-toggle.tsx` |
| Create | `packages/core/src/screens/main/pos/products/grid/product-tile.tsx` |
| Create | `packages/core/src/screens/main/pos/products/grid/variable-product-tile.tsx` |
| Create | `packages/core/src/screens/main/pos/products/grid/index.tsx` |
| Modify | `packages/core/src/screens/main/pos/products/index.tsx` |
| Create | `packages/components/src/slider/index.tsx` |
| Modify | `packages/core/src/screens/main/pos/products/ui-settings-form.tsx` |
| Modify | UI label file (TBD in Task 9) |
