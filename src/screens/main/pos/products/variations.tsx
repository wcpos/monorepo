import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import { Price } from './cells/price';
import { ProductVariationActions } from './cells/variation-actions';
import { ProductVariationImage } from '../../components/product/variation-image';
import { ProductVariationName } from '../../components/product/variation-name';
import FilterBar from '../../components/product/variation-table-rows/filter-bar';
import Footer from '../../components/product/variation-table-rows/footer';
import useVariations from '../../contexts/variations';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface VariationsProps {
	extraData: any;
	parent: ProductDocument;
	parentIndex: number;
}

const cells = {
	actions: ProductVariationActions,
	image: ProductVariationImage,
	price: Price,
	name: ProductVariationName,
};

/**
 *
 */
const Variations = ({ extraData, parent, parentIndex }: VariationsProps) => {
	const { resource } = useVariations();
	const variations = useObservableSuspense(resource);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductVariationDocument>>(
		({ item, column, index, cellWidth }) => {
			const Cell = get(cells, column.key);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell
								item={item}
								column={column}
								index={index}
								parent={parent}
								cellWidth={cellWidth}
							/>
						</Suspense>
					</ErrorBoundary>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
		},
		[parent]
	);

	/**
	 *
	 */
	return (
		<Box style={{ borderLeftWidth: 2 }}>
			<FilterBar parent={parent} />
			{variations.map((variation, index) => {
				return (
					<Table.Row
						key={variation.uuid}
						item={variation}
						extraData={extraData}
						cellRenderer={cellRenderer}
						index={parentIndex + 1 + index}
					/>
				);
			})}
			<Footer count={variations.length} parent={parent} />
		</Box>
	);
};

export default Variations;
