import * as React from 'react';
import { View } from 'react-native';

import { CellContext } from '@tanstack/react-table';
import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useQueryManager } from '@wcpos/query';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useVariationTable } from './variation-table-rows/context';
import { useT } from '../../../../contexts/translations';

type ProductDocument = import('@wcpos/database').ProductDocument;

/**
 *
 */
export const PlainAttributes = ({ row }: CellContext<ProductDocument, 'name'>) => {
	const product = row.original;
	const attributes = useObservableEagerState(product.attributes$);

	/**
	 *
	 */
	return (
		<VStack>
			{attributes
				.filter((attr: any) => !attr.variation)
				.map((attr: any) => (
					<HStack key={`${attr.name}-${attr.id}`} className="flex-wrap gap-0">
						<Text className="text-xs text-muted-foreground">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<Text className="text-xs" key={option}>
								{option}
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
	const product = row.original;
	const attributes = useObservableEagerState(product.attributes$);
	const isExpanded = useObservableEagerState(
		table.options.meta.expanded$.pipe(map((expanded) => !!expanded[row.id]))
	);

	// const {
	// 	expanded,
	// 	setExpanded,
	// 	setInitialSelectedAttributes,
	// 	childrenSearchCount,
	// 	parentSearchTerm,
	// } = useVariationTable();
	const manager = useQueryManager();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			row.toggleExpanded(true);
			const query = manager.getQuery(['variations', { parentID: product.id }]);
			if (query) {
				query.where('attributes', {
					$elemMatch: {
						id: attribute.id,
						name: attribute.name,
						option,
					},
				});
			}
		},
		[manager, product.id, row]
	);

	/**
	 * Expand text string
	 */
	// const expandText = React.useMemo(() => {
	// 	let text = '';
	// 	if (expanded) {
	// 		text += t('Collapse', { _tags: 'core' });
	// 	} else {
	// 		text += t('Expand', { _tags: 'core' });
	// 	}
	// 	if (childrenSearchCount === 1) {
	// 		text += ' - ';
	// 		text += t('1 variation found for {term}', {
	// 			term: parentSearchTerm,
	// 			_tags: 'core',
	// 		});
	// 	} else if (childrenSearchCount > 0) {
	// 		text += ' - ';
	// 		text += t('{count} variations found for {term}', {
	// 			count: childrenSearchCount,
	// 			term: parentSearchTerm,
	// 			_tags: 'core',
	// 		});
	// 	}
	// 	return text;
	// }, [childrenSearchCount, expanded, parentSearchTerm, t]);

	/**
	 *
	 */
	return (
		<VStack space="xs">
			{(attributes || [])
				.filter((attr: any) => attr.variation)
				.map((attr: any) => (
					<HStack key={`${attr.name}-${attr.id}`} className="flex-wrap gap-0">
						<Text className="text-xs text-muted-foreground">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={option}>
								<Text
									className="text-xs text-primary"
									variant="link"
									onPress={() => handleSelect(attr, option)}
								>
									{option}
								</Text>
								<Text className="text-xs">{index < attr.options.length - 1 && ', '}</Text>
							</React.Fragment>
						))}
					</HStack>
				))}
			<Text className="text-xs text-primary" variant="link" onPress={() => row.toggleExpanded()}>
				{isExpanded ? 'Collapse' : 'Expand'}
			</Text>
		</VStack>
	);
};
