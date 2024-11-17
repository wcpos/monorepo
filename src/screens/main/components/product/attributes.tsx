import * as React from 'react';

import { CellContext } from '@tanstack/react-table';
import { decode } from 'html-entities';
import { useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { HStack } from '@wcpos/components/src/hstack';
import { Text } from '@wcpos/components/src/text';
import { VStack } from '@wcpos/components/src/vstack';
import { useQueryManager } from '@wcpos/query';

import { useVariationRow } from './variable-product-row/context';
import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const PlainAttributes = ({ row }: CellContext<{ document: ProductDocument }, 'name'>) => {
	const product = row.original.document;
	const attributes = useObservableEagerState(product.attributes$);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack space="xs">
			{attributes
				.filter((attr: any) => !attr.variation)
				.map((attr: any, index: number) => (
					<HStack key={index} className="flex-wrap gap-0">
						<Text className="text-xs text-muted-foreground">{`${decode(attr.name)}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<Text className="text-xs" key={index}>
								{decode(option)}
								{index < attr.options.length - 1 && ', '}
							</Text>
						))}
					</HStack>
				))}
		</VStack>
	);
};

/**
 *
 */
export const ProductAttributes = ({ row, table }) => {
	const product = row.original.document;
	const attributes = useObservableEagerState(product.attributes$);
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[row.id]))
	);
	const { updateQueryParams } = useVariationRow();

	const manager = useQueryManager();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			row.toggleExpanded(true);

			if (manager.hasQuery(['variations', { parentID: product.id }])) {
				const query = manager.getQuery(['variations', { parentID: product.id }]);
				// remove any search term previously set
				query.search('');
				query
					.variationMatch({
						id: attribute.id,
						name: attribute.name,
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
		[manager, product.id, row, updateQueryParams]
	);

	/**
	 * Expand the row
	 * Also, special case for when search has found variations, set the useQueryParams
	 * so we can pick up the search term in the variations table
	 */
	const handleExpand = React.useCallback(() => {
		if (isExpanded) {
			row.toggleExpanded(false);
			return;
		}
		if (row.original.childrenSearchCount > 0) {
			if (manager.hasQuery(['variations', { parentID: product.id }])) {
				const query = manager.getQuery(['variations', { parentID: product.id }]);
				query.search(row.original.parentSearchTerm);
				query.removeWhere('attributes').exec();
			} else {
				updateQueryParams('search', row.original.parentSearchTerm);
				updateQueryParams('attribute', null);
			}
		}
		row.toggleExpanded();
	}, [manager, product.id, row, updateQueryParams, isExpanded]);

	/**
	 * Expand text string
	 */
	const expandText = React.useMemo(() => {
		let text = '';
		if (isExpanded) {
			text += t('Collapse', { _tags: 'core' });
		} else {
			text += t('Expand', { _tags: 'core' });
		}
		if (row.original.childrenSearchCount === 1) {
			text += ' - ';
			text += t('1 variation found for {term}', {
				term: row.original.parentSearchTerm,
				_tags: 'core',
			});
		} else if (row.original.childrenSearchCount > 0) {
			text += ' - ';
			text += t('{count} variations found for {term}', {
				count: row.original.childrenSearchCount,
				term: row.original.parentSearchTerm,
				_tags: 'core',
			});
		}
		return text;
	}, [isExpanded, row.original.childrenSearchCount, row.original.parentSearchTerm, t]);

	/**
	 * @NOTE - Don't use a unique key here, index is sufficient
	 * https://shopify.github.io/flash-list/docs/fundamentals/performant-components#remove-key-prop
	 */
	return (
		<VStack space="xs">
			{(attributes || [])
				.filter((attr: any) => attr.variation)
				.map((attr: any, index: number) => (
					<HStack key={index} className="flex-wrap gap-0">
						<Text className="text-xs text-muted-foreground">{`${decode(attr.name)}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={index}>
								<Text
									className="text-xs text-primary"
									variant="link"
									onPress={() => handleSelect(attr, option)}
								>
									{decode(option)}
								</Text>
								<Text className="text-xs">{index < attr.options.length - 1 && ', '}</Text>
							</React.Fragment>
						))}
					</HStack>
				))}
			<Text className="text-xs text-primary" variant="link" onPress={handleExpand}>
				{expandText}
			</Text>
		</VStack>
	);
};
