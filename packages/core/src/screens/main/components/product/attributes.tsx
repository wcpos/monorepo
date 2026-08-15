import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useQueryState, useQueryStateActions } from '../../../../query';
import { setVariationMatch } from './variation-matches';
import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export function PlainAttributes({ row }: CellContext<{ document: ProductDocument }, 'name'>) {
	const product = row.original.document;
	const attributes = useObservableEagerState(product.attributes$!);

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
	document: ProductDocument;
	childrenSearchCount?: number;
	parentSearchTerm?: string;
};

export function ProductAttributes({
	row,
	table,
}: CellContext<{ document: ProductDocument }, 'name'>) {
	const original = row.original as ProductRowOriginal;
	const product = row.original.document;
	const attributes = useObservableEagerState(product.attributes$!);
	const meta = table.options.meta as unknown as {
		expanded$: import('rxjs').Observable<Record<string, boolean>>;
		setRowExpanded?: (id: string, expanded: boolean) => void;
	};
	const isExpanded = useObservableEagerState(
		meta.expanded$.pipe(map((expanded: Record<string, boolean>) => !!expanded[row.id]))
	);
	const matches = useQueryState<'variations', import('../../../../query').VariationMatch[]>(
		(state) => state.filters.attributeMatches
	);
	const actions = useQueryStateActions<'variations'>();
	const t = useT();

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
			setRowExpanded?.(row.id, true);
			actions.clearSearch();
			actions.setFilter(
				'attributeMatches',
				setVariationMatch(matches, {
					id: attribute.id ?? 0,
					name: attribute.name ?? '',
					option,
				})
			);
		},
		[actions, matches, row.id, setRowExpanded]
	);

	/**
	 * Expand the row
	 * Also, when relational search found child variations, seed this row's query state
	 * with the parent search term before mounting its variations table.
	 */
	const handleExpand = React.useCallback(() => {
		if (isExpanded) {
			setRowExpanded?.(row.id, false);
			return;
		}
		if ((original.childrenSearchCount ?? 0) > 0) {
			actions.setSearch(original.parentSearchTerm ?? '');
			actions.clearFilter('attributeMatches');
		}
		setRowExpanded?.(row.id, true);
	}, [
		actions,
		row.id,
		original.childrenSearchCount,
		original.parentSearchTerm,
		setRowExpanded,
		isExpanded,
	]);

	/**
	 * Expand text string
	 */
	const expandText = React.useMemo(() => {
		let text = '';
		if (isExpanded) {
			text += t('common.collapse');
		} else {
			text += t('common.expand');
		}
		if ((original.childrenSearchCount ?? 0) > 0) {
			text += ' - ';
			text += t('common.variation_found_for_term', {
				count: original.childrenSearchCount ?? 0,
				term: original.parentSearchTerm,
			});
		}
		return text;
	}, [isExpanded, original.childrenSearchCount, original.parentSearchTerm, t]);

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
			<Text
				testID="variable-product-expand"
				className="text-primary text-xs"
				variant="link"
				onPress={handleExpand}
			>
				{expandText}
			</Text>
		</VStack>
	);
}
