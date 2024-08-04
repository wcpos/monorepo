import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';
import { VStack } from '@wcpos/tailwind/src/vstack';

import { useAppState } from '../../../../../contexts/app-state';
import { useCurrentOrderCurrencyFormat } from '../../../hooks/use-current-order-currency-format';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine | ShippingLine;
	column: import('@wcpos/tailwind/src/table').ColumnProps<FeeLine>;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const FeeAndShippingTotal = ({ uuid, item, column }: Props) => {
	const { format } = useCurrentOrderCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);

	/**
	 * Get display values if cart includes tax
	 */
	const displayTotal = React.useMemo(() => {
		if (taxDisplayCart === 'incl') {
			return parseFloat(item.total) + parseFloat(item.total_tax);
		}

		return item.total;
	}, [item.total, item.total_tax, taxDisplayCart]);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */
	return (
		<VStack space="xs" className="justify-end">
			<Text>{format(displayTotal || 0)}</Text>
			{show('tax') && (
				<Text className="text-sm text-muted">
					{`${taxDisplayCart} ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</VStack>
	);
};
