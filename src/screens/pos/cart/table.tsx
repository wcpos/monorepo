import * as React from 'react';
import { View } from 'react-native';
import { useObservable, useObservableState } from 'observable-hooks';
import { from, of, combineLatest, zip, Observable } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import Table from '@wcpos/common/src/components/table3';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';
import Pressable from '@wcpos/common/src/components/pressable';
import TextInput from '@wcpos/common/src/components/textinput';
import Button from '@wcpos/common/src/components/button';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import LineItem from './rows/line-item';
import FeeLine from './rows/fee-line';
import ShippingLine from './rows/shipping-line';

type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;
type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type GetHeaderCellPropsFunction =
	import('@wcpos/common/src/components/table/header-row').GetHeaderCellPropsFunction;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type LineItemDocument = import('@wcpos/common/src/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/common/src/database').ShippingLineDocument;

interface ICartTableProps {
	order: OrderDocument;
	// columns: ColumnProps[];
	// items: any;
	// query: any;
	// onSort: Sort;
	ui: any;
}

const CartTable = ({ order, ui }: ICartTableProps) => {
	const columns = useObservableState(ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const handleSort = React.useCallback<Sort>(
		({ sortBy, sortDirection }) => {
			// @ts-ignore
			setQuery({ ...query, sortBy, sortDirection });
		},
		[query]
	);

	const items = useObservableState(order.cart$, []);

	return <Table data={items} columns={columns} />;
};

export default CartTable;
