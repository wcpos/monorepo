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
		forEach(changed, ({ item, isViewable }) => {
			if (isViewable && !item.isSynced()) {
				const replicationState = item.syncRestApi({
					pull: {},
				});
				// replicationState.error$.subscribe((err: any) => {
				// 	console.error('replication error:');
				// 	console.dir(err);
				// });
				replicationState.run(false);
			}
		});
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
				<Table.Header.Row columns={columns}>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.Header.Row.Cell {...getHeaderCellProps()}>
								{t(`products.column.label.${column.key}`)}
							</Table.Header.Row.Cell>
						);
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row product={item} columns={columns} display={display} />}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
