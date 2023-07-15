import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Link from '@wcpos/components/src/link';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../lib/translations';
import useProducts from '../../contexts/products';

type Props = {
	product: import('@wcpos/database').ProductDocument;
};

const ProductAttributes = ({ product }: Props) => {
	const attributes = useObservableState(product.attributes$, product.attributes);
	const { shownVariations$, setVariationsQuery } = useProducts();
	const expanded = useObservableState(
		shownVariations$.pipe(map((q) => q && q[product.uuid])),
		false
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
								<Link
									size="small"
									onPress={() => {
										setVariationsQuery(product, { name: attr.name, option });
									}}
								>
									{option}
								</Link>
								{index < attr.options.length - 1 && ', '}
							</React.Fragment>
						))}
					</Text>
				))}
			<Link
				size="small"
				onPress={() => {
					setVariationsQuery(product, expanded ? undefined : {});
				}}
			>
				{expanded ? t('Collapse', { _tags: 'core' }) : t('Expand', { _tags: 'core' })}
			</Link>
		</Box>
	);
};

export default ProductAttributes;
