import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import Text from '@wcpos/components/src/text';

import { useVariationTable } from './variation-table-rows/context';
import { useStoreStateManager } from '../../contexts/store-state-manager';
import { updateVariationAttributeSearch } from '../../contexts/store-state-manager/hooks/variations.helpers';
import { useT } from '../../../../contexts/translations';

type Props = {
	product: import('@wcpos/database').ProductDocument;
};

const ProductAttributes = ({ product }: Props) => {
	const attributes = useObservableState(product.attributes$, product.attributes);
	const { expanded, setExpanded } = useVariationTable();
	const manager = useStoreStateManager();
	const t = useT();

	/**
	 *
	 */
	const handleSelect = React.useCallback(
		(attribute, option) => {
			if (!expanded) {
				// @TODO - find a better way to do this
				setExpanded({
					id: attribute.id,
					name: attribute.name,
					option,
				});
			} else {
				const query = manager.getQuery(['variations', { parentID: product.id }]);
				const newState = updateVariationAttributeSearch(query.currentState.search, {
					id: attribute.id,
					name: attribute.name,
					option,
				});
				query.search(newState);
			}
		},
		[expanded, manager, product.id, setExpanded]
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
