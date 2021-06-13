import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '@wcpos/common/src/components/table';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import forEach from 'lodash/forEach';
import Row from './rows';

type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;
type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type GetHeaderCellPropsFunction =
	import('@wcpos/common/src/components/table/header-row').GetHeaderCellPropsFunction;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

interface Props {
	columns: any;
	display: any;
	query: any;
	sort: Sort;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 *
 */
const ProductsTable = ({ columns, display, query, sort }: Props) => {
	const { t } = useTranslation();
	const { storeDB } = useAppState() as { storeDB: StoreDatabase };

	const products$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					console.log(q);
					const regexp = new RegExp(escape(q.search), 'i');
					const selector = {
						name: { $regex: regexp },
						// categories: { $elemMatch: { id: 20 } },
					};
					forEach(q.filter, (value, key) => {
						if (value.length > 0) {
							// @ts-ignore
							selector[key] = { $elemMatch: { id: value[0].id } };
						}
					});
					const RxQuery = storeDB.collections.products
						.find({ selector })
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	const products = useObservableState(products$, []) as any[];

	const handleVieweableItemsChanged = React.useCallback(({ changed }) => {
		console.log(changed);
		// setViewedItems(oldViewedItems => {
		//   // We can have access to the current state without adding it
		//   //  to the useCallback dependencies

		//   let newViewedItems = null;

		//   changed.forEach(({ index, isViewable }) => {
		//     if (index != null && isViewable && !oldViewedItems.includes(index)) {

		//        if (newViewedItems == null) {
		//          newViewedItems = [...oldViewedItems];
		//        }
		//        newViewedItems.push(index);
		//     }
		//   });

		//   // If the items didn't change, we return the old items so
		//   //  an unnecessary re-render is avoided.
		//   return newViewedItems == null ? oldViewedItems : newViewedItems;
		// });

		// Since it has no dependencies, this function is created only once
	}, []);
	const viewConfigRef = React.useRef({
		minimumViewTime: 1000,
		viewAreaCoveragePercentThreshold: 0,
	});

	return (
		<Table
			columns={columns}
			data={products}
			sort={sort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			// @ts-ignore
			onViewableItemsChanged={handleVieweableItemsChanged}
			// @ts-ignore
			viewabilityConfig={viewConfigRef.current}
		>
			<Table.Header>
				<Table.HeaderRow columns={columns}>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`products.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row product={item} columns={columns} display={display} />}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
