import * as React from 'react';

import get from 'lodash/get';
import { useObservableSuspense, useObservableEagerState } from 'observable-hooks';

import type { OrderDocument } from '@wcpos/database';
import { Box } from '@wcpos/tailwind/src/box';
import { Card, CardContent, CardHeader } from '@wcpos/tailwind/src/card';
import { ErrorBoundary } from '@wcpos/tailwind/src/error-boundary';
import { HStack } from '@wcpos/tailwind/src/hstack';
import { Suspense } from '@wcpos/tailwind/src/suspense';
import Table, { CellRenderer } from '@wcpos/tailwind/src/table';
import { Text } from '@wcpos/tailwind/src/text';

import { UISettingsForm } from './ui-settings-form';
import { useT } from '../../../contexts/translations';
import { Date } from '../components/date';
import { Cashier } from '../components/order/cashier';
import { CreatedVia } from '../components/order/created-via';
import { Customer } from '../components/order/customer';
import { PaymentMethod } from '../components/order/payment-method';
import { Status } from '../components/order/status';
import { Total } from '../components/order/total';
import { TextCell } from '../components/text-cell';
import { UISettingsButton } from '../components/ui-settings';
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
		<Box className="p-2 pt-0 pr-0 h-full">
			<Card className="flex-1">
				<CardHeader className="p-2 bg-input">
					<HStack>
						<Text className="text-lg flex-1">{t('Orders', { _tags: 'core' })}</Text>
						<UISettingsButton title={t('Order Settings', { _tags: 'core' })}>
							<UISettingsForm />
						</UISettingsButton>
					</HStack>
				</CardHeader>
				<CardContent className="flex-1 p-0">
					<ErrorBoundary>
						<Suspense>
							<Table
								data={result.hits}
								context={context}
								footer={
									<Box
										horizontal
										// style={{
										// 	width: '100%',
										// 	backgroundColor: theme.colors.lightGrey,
										// 	borderBottomLeftRadius: theme.rounding.medium,
										// 	borderBottomRightRadius: theme.rounding.medium,
										// 	borderTopWidth: 1,
										// 	borderTopColor: theme.colors.grey,
										// }}
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
				</CardContent>
			</Card>
		</Box>
	);
};
