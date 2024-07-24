import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import { useQueryManager } from '@wcpos/query';
import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useVariationTable } from './variation-table-rows/context';
import { useT } from '../../../../contexts/translations';

type Props = {
	product: import('@wcpos/database').ProductDocument;
};

export const PlainAttributes = ({ product }: Props) => {
	const attributes = useObservableState(product.attributes$, product.attributes);

	/**
	 *
	 */
	return (
		<Box space="xxSmall">
			{attributes
				.filter((attr: any) => !attr.variation)
				.map((attr: any) => (
					<Text key={`${attr.name}-${attr.id}`}>
						<Text size="small" type="secondary">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<Text size="small" key={option}>
								{option}
								{index < attr.options.length - 1 && ', '}
							</Text>
						))}
					</Text>
				))}
		</Box>
	);
};

const ProductAttributes = ({ product }: Props) => {
	const attributes = useObservableState(product.attributes$, product.attributes);
	const {
		expanded,
		setExpanded,
		setInitialSelectedAttributes,
		childrenSearchCount,
		parentSearchTerm,
	} = useVariationTable();
	const manager = useQueryManager();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			if (!expanded) {
				setInitialSelectedAttributes({
					id: attribute.id,
					name: attribute.name,
					option,
				});
				setExpanded(true);
			} else {
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
			}
		},
		[expanded, manager, product.id, setExpanded, setInitialSelectedAttributes]
	);

	/**
	 * Expand text string
	 */
	const expandText = React.useMemo(() => {
		let text = '';
		if (expanded) {
			text += t('Collapse', { _tags: 'core' });
		} else {
			text += t('Expand', { _tags: 'core' });
		}
		if (childrenSearchCount === 1) {
			text += ' - ';
			text += t('1 variation found for {term}', {
				term: parentSearchTerm,
				_tags: 'core',
			});
		} else if (childrenSearchCount > 0) {
			text += ' - ';
			text += t('{count} variations found for {term}', {
				count: childrenSearchCount,
				term: parentSearchTerm,
				_tags: 'core',
			});
		}
		return text;
	}, [childrenSearchCount, expanded, parentSearchTerm, t]);

	/**
	 *
	 */
	return (
		<VStack space="xs">
			{attributes
				.filter((attr: any) => attr.variation)
				.map((attr: any) => (
					<React.Fragment key={`${attr.name}-${attr.id}`}>
						<Text className="text-sm">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={option}>
								<Button variant="link" onPress={() => handleSelect(attr, option)}>
									<ButtonText className="text-sm">{option}</ButtonText>
								</Button>
								{index < attr.options.length - 1 && ', '}
							</React.Fragment>
						))}
					</React.Fragment>
				))}
			<Button variant="link" onPress={() => setExpanded(!expanded)}>
				<ButtonText className="text-sm">{expandText}</ButtonText>
			</Button>
		</VStack>
	);
};

export default ProductAttributes;
