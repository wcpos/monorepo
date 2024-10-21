import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

/**
 *
 */
export const useBaseTaxLocation = () => {
	const { store } = useAppState();
	const country = useObservableEagerState(store.store_country$);
	const state = useObservableEagerState(store.store_state$);
	const city = useObservableEagerState(store.store_city$);
	const postcode = useObservableEagerState(store.store_postcode$);

	return {
		country,
		state,
		city,
		postcode,
	};
};
