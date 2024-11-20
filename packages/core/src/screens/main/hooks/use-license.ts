import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { useAppState } from '../../../contexts/app-state';

/**
 *
 */
export const useLicense = () => {
	const { site } = useAppState();
	const license = useObservableEagerState(site.license$);

	return { isPro: !!license?.key };
};
