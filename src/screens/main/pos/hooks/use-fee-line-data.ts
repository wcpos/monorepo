import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { extractFeeLineData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];

/**
 * Custom hook to retrieve and process fee line data.
 */
export const useFeeLineData = () => {
	const { store } = useAppState();
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$) === 'yes';

	/**
	 * Retrieves and processes the fee line data.
	 */
	const getFeeLineData = React.useCallback(
		(item: FeeLine) => extractFeeLineData(item, pricesIncludeTax),
		[pricesIncludeTax]
	);

	return {
		getFeeLineData,
	};
};
