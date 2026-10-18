import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { observeRegister$ } from '@wcpos/query/register-session';

import { useAppState } from '../../contexts/app-state';

export function useRegister() {
	const { userDB } = useAppState();
	const register$ = React.useMemo(() => observeRegister$(userDB), [userDB]);
	return useObservableState(register$, null);
}
