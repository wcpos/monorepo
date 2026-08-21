import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';

/**
 *
 */
export const useBaseTaxLocation = () => {
	const { store } = useAppState();
	const country = useDocField(store, (value) => value.store_country);
	const state = useDocField(store, (value) => value.store_state);
	const city = useDocField(store, (value) => value.store_city);
	const postcode = useDocField(store, (value) => value.store_postcode);

	return {
		country,
		state,
		city,
		postcode,
	};
};
