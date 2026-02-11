import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { useQueryManager } from '@wcpos/query';

import { useVariationRow } from './variable-product-row/context';
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
	const { updateQueryParams } = useVariationRow();

	const manager = useQueryManager();
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

			if (manager.hasQuery(['variations', { parentID: product.id }])) {
				const query = manager.getQuery(['variations', { parentID: product.id }]);
				// remove any search term previously set
				query?.search('');
				query
					?.variationMatch({
						id: attribute.id ?? 0,
						name: attribute.name ?? '',
						option,
					})
					.exec();
			} else {
				// remove any search term previously set
				updateQueryParams('search', null);
				// we need to pass the attribute/option down so it can be used in the table
				updateQueryParams('attribute', {
					id: attribute.id,
					name: attribute.name,
					option,
				});
			}
		},
		[manager, product.id, row.id, setRowExpanded, updateQueryParams]
	);

	/**
	 * Expand the row
	 * Also, special case for when search has found variations, set the useQueryParams
	 * so we can pick up the search term in the variations table
	 */
	const handleExpand = React.useCallback(() => {
		if (isExpanded) {
			setRowExpanded?.(row.id, false);
			return;
		}
		if ((original.childrenSearchCount ?? 0) > 0) {
			if (manager.hasQuery(['variations', { parentID: product.id }])) {
				const query = manager.getQuery(['variations', { parentID: product.id }]);
				query?.search(original.parentSearchTerm ?? '');
				query?.removeWhere('attributes').exec();
			} else {
				updateQueryParams('search', original.parentSearchTerm);
				updateQueryParams('attribute', null);
			}
		}
		setRowExpanded?.(row.id, true);
	}, [
		manager,
		product.id,
		row.id,
		original.childrenSearchCount,
		original.parentSearchTerm,
		setRowExpanded,
		updateQueryParams,
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
			<Text className="text-primary text-xs" variant="link" onPress={handleExpand}>
				{expandText}
			</Text>
		</VStack>
	);
}
