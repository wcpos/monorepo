import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import Text from '@wcpos/components/src/text';

import { useVariationTable } from './variation-table-rows/context';
import { t } from '../../../../lib/translations';
import { updateVariationAttributeSearch } from '../../contexts/variations.helpers';

type Props = {
	product: import('@wcpos/database').ProductDocument;
};

const ProductAttributes = ({ product }: Props) => {
	const attributes = useObservableState(product.attributes$, product.attributes);
	const { query, expanded, setExpanded } = useVariationTable();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			if (!expanded) {
				// @TODO - find a better way to do this
				// I need to expand the table, then update the query
				setExpanded({
					id: attribute.id,
					name: attribute.name,
					option,
				});
			} else {
				const newState = updateVariationAttributeSearch(query.currentState.search, {
					id: attribute.id,
					name: attribute.name,
					option,
				});
				query.search(newState);
			}
		},
		[expanded, query, setExpanded]
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
