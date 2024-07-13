import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableEagerState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import Table, { CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import type { OrderDocument } from '@wcpos/database';

import { useT } from '../../../contexts/translations';
import { Date } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import Customer from '../components/order/customer';
import PaymentMethod from '../components/order/payment-method';
import Status from '../components/order/status';
import Total from '../components/order/total';
import TextCell from '../components/text-cell';
import UiSettings from '../components/ui-settings';
import { useUISettings } from '../contexts/ui-settings';

const cells = {
	customer_id: Customer,
	status: Status,
	total: Total,
	date_created_gmt: Date,
	date_modified_gmt: Date,
	date_completed_gmt: Date,
	date_paid_gmt: Date,
	payment_method: PaymentMethod,
	created_via: CreatedVia,
	cashier: Cashier,
};

/**
 *
 */
export const Orders = ({ query }) => {
	const result = useObservableSuspense(query.resource);
	const { uiSettings, getUILabel } = useUISettings('reports-orders');
	const columns = useObservableEagerState(uiSettings.columns$);
	const { sortBy, sortDirection } = useObservableEagerState(query.params$);
	const theme = useTheme();
	const t = useT();

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<{ document: OrderDocument }>>(
		({ item, column, index }) => {
			const Cell = get(cells, [column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<Suspense>
							<Cell item={item.document} column={column} index={index} />
						</Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item.document} column={column} />;
		},
		[]
	);

	/**
	 *
	 */
	const context = React.useMemo(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			cellRenderer,
			headerLabel: ({ column }) => getUILabel(column.key),
			query,
		};
	}, [columns, sortBy, sortDirection, cellRenderer, query, getUILabel]);

	/**
	 *
	 */
	return (
		<Box padding="small" paddingRight="none" style={{ height: '100%' }}>
			<Box
				raised
				rounding="medium"
				style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
			>
				<Box
					horizontal
					style={{
						backgroundColor: theme.colors.grey,
						borderTopLeftRadius: theme.rounding.medium,
						borderTopRightRadius: theme.rounding.medium,
					}}
				>
					<Box horizontal fill align="center" padding="small" space="small">
						<Box horizontal fill>
							<Text size="medium">{t('Orders', { _tags: 'core' })}</Text>
						</Box>
						<ErrorBoundary>
							<UiSettings uiSettings={uiSettings} title={t('Order Settings', { _tags: 'core' })} />
						</ErrorBoundary>
					</Box>
				</Box>
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<ErrorBoundary>
						<Suspense>
							<Table
								data={result.hits}
								context={context}
								footer={
									<Box
										horizontal
										style={{
											width: '100%',
											backgroundColor: theme.colors.lightGrey,
											borderBottomLeftRadius: theme.rounding.medium,
											borderBottomRightRadius: theme.rounding.medium,
											borderTopWidth: 1,
											borderTopColor: theme.colors.grey,
										}}
									>
										<Box
											fill
											horizontal
											padding="small"
											space="xSmall"
											align="center"
											distribution="end"
										>
											<Text size="small">
												{t('Showing {count}', { count: result.count, _tags: 'core' })}
											</Text>
											{/* <SyncButton sync={sync} clear={clear} active={active} /> */}
										</Box>
									</Box>
								}
							/>
						</Suspense>
					</ErrorBoundary>
				</Box>
			</Box>
		</Box>
	);
};
