import * as React from 'react';

import type { CellContext, Row } from '@wcpos/core/table-types';
import { Button } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useQueryState, useQueryStateActions } from '../../../../query';
import { setVariationMatch } from './variation-matches';
import { useRowExpansion } from './variable-product-row/use-row-expansion';
import { useT } from '../../../../contexts/translations';

import type { VariationMatch } from '../../../../query';
import type { TableFeatures, TableMeta } from '@tanstack/react-table';

/**
 *
 */
export function PlainAttributes({
	row,
}: CellContext<{ record: EngineRecord<'products'> }, 'name'>) {
	const attributes = useRecordField(row.original.record, (product) => product.payload.attributes);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack space={null}>
			{(attributes || [])
				.filter((attr: any) => !attr.variation)
				.map((attr: any, index: number) => (
					<HStack key={index} className="flex-wrap gap-0">
						<Text className="text-muted-foreground text-xs" decodeHtml>{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<Text className="text-xs" key={index} decodeHtml>
								{option}
								{index < attr.options.length - 1 && ', '}
							</Text>
						))}
					</HStack>
				))}
		</VStack>
	);
}

/**
 *
 */
type ProductRowOriginal = {
	record: EngineRecord<'products'>;
	childrenSearchCount?: number;
	parentSearchTerm?: string;
};

export function ProductAttributes({ row, table }: CellContext<ProductRowOriginal, 'name'>) {
	const attributes = useRecordField(row.original.record, (product) => product.payload.attributes);
	const meta = table.options.meta;
	const matches = useQueryState<'variations', VariationMatch[]>(
		(state) => state.filters.attributeMatches
	);
	const actions = useQueryStateActions<'variations'>();

	/**
	 * Use setRowExpanded from table meta to bypass TanStack's buggy updater function
	 * which has a minification bug with computed property destructuring
	 */
	const setRowExpanded = meta?.setRowExpanded;

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute: { id?: number; name?: string }, option: string) => {
			const match = { id: attribute.id ?? 0, name: attribute.name ?? '', option };
			if (meta?.drill) return meta.drill(row, match);
			setRowExpanded?.(row.id, true);
			actions.clearSearch();
			actions.setFilter('attributeMatches', setVariationMatch(matches, match));
		},
		[actions, matches, row, setRowExpanded, meta]
	);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack space={null}>
			{(attributes || [])
				.filter((attr: any) => attr.variation)
				.map((attr: any, index: number) => (
					<HStack key={index} className="flex-wrap gap-0">
						<Text className="text-muted-foreground text-xs" decodeHtml>{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={index}>
								<Text
									className="text-primary text-xs"
									variant="link"
									onPress={() => handleSelect(attr, option)}
									decodeHtml
								>
									{option}
								</Text>
								<Text className="text-xs">{index < attr.options.length - 1 && ', '}</Text>
							</React.Fragment>
						))}
					</HStack>
				))}
			<VariationsButton row={row} table={table} />
		</VStack>
	);
}

type ButtonMeta<TF extends TableFeatures> = Pick<
	TableMeta<TF, ProductRowOriginal>,
	'drill' | 'expanded$' | 'setRowExpanded'
>;

/**
 * "n variations" under a variable product's name, the way in to its variations: it drills into
 * them (the drill style, chevron after) or toggles the row open (chevron before), seeding the
 * products search its variations matched. Inside the row's `VariationRowProvider`.
 */
export function VariationsButton<TFeatures extends TableFeatures>({
	row,
	table,
}: {
	row: Row<ProductRowOriginal, TFeatures>;
	table: { options: { meta?: ButtonMeta<TFeatures> } };
}) {
	const t = useT();
	const drill = table.options.meta?.drill;
	const { expanded, toggle } = useRowExpansion(row, table);
	const { childrenSearchCount = 0, parentSearchTerm, record } = row.original;
	const count = useRecordField(record, (product) => product.payload.variations?.length ?? 0);
	let label = t('products.n_variations', { count });
	if (childrenSearchCount > 0) {
		label += ` - ${t('common.variation_found_for_term', { count: childrenSearchCount, term: parentSearchTerm })}`;
	}
	return (
		<Button
			testID="variable-product-expand"
			variant="ghost"
			size="sm"
			className="self-start"
			leftIcon={drill ? undefined : expanded ? 'chevronDown' : 'chevronRight'}
			rightIcon={drill ? 'chevronRight' : undefined}
			aria-expanded={drill ? undefined : expanded}
			onPress={drill ? () => drill(row) : toggle}
		>
			{label}
		</Button>
	);
}
