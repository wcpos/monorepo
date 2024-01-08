import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import Text from '@wcpos/components/src/text';
import { useQueryManager } from '@wcpos/query';

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
	const { expanded, setExpanded, setInitialSelectedAttributes } = useVariationTable();
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
					query.updateVariationAttributeSelector({
						id: attribute.id,
						name: attribute.name,
						option,
					});
				}
			}
		},
		[expanded, manager, product.id, setExpanded, setInitialSelectedAttributes]
	);

	/**
	 *
	 */
	return (
		<Box space="xxSmall">
			{attributes
				.filter((attr: any) => attr.variation)
				.map((attr: any) => (
					<Text key={`${attr.name}-${attr.id}`}>
						<Text size="small" type="secondary">{`${attr.name}: `}</Text>
						{attr.options.map((option: string, index: number) => (
							<React.Fragment key={option}>
								<Link size="small" onPress={() => handleSelect(attr, option)}>
									{option}
								</Link>
								{index < attr.options.length - 1 && ', '}
							</React.Fragment>
						))}
					</Text>
				))}
			<Link size="small" onPress={() => setExpanded(!expanded)}>
				{expanded ? t('Collapse', { _tags: 'core' }) : t('Expand', { _tags: 'core' })}
			</Link>
		</Box>
	);
};

export default ProductAttributes;
