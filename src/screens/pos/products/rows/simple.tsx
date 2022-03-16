import * as React from 'react';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import Table from '@wcpos/common/src/components/table3';
import Actions from './cells/actions';
import Image from './cells/image';
import Name from './cells/name';
import Price from './cells/price';
import RegularPrice from './cells/regular-price';
import Sku from './cells/sku';
import Categories from '../../../common/product-categories';
import Tag from '../../../common/product-tags';

type ProductDocument = import('@wcpos/common/src/database').ProductDocument;
type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;

interface Props {
	// order: import('@wcpos/common/src/database').OrderDocument;
	product: ProductDocument;
	columns: any;
}

const cells = {
	actions: Actions,
	categories: Categories,
	image: Image,
	name: Name,
	price: Price,
	regularPrice: RegularPrice,
	sku: Sku,
	tag: Tag,
};

const SimpleProduct = ({ product, columns }: Props) => {
	const rerender = useObservableState(product.$);

	const cellRenderer = React.useCallback((item: ProductDocument, column: ColumnProps) => {
		const Cell = get(cells, column.key);
		return Cell ? <Cell item={item} column={column} /> : null;
	}, []);

	return <Table.Row item={product} columns={columns} cellRenderer={cellRenderer} />;
};

export default SimpleProduct;
