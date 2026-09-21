import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppState } from '../../contexts/app-state';
import { observeRegister$ } from './register-document';

export function useRegister() {
	const { userDB } = useAppState();
	const register$ = React.useMemo(() => observeRegister$(userDB), [userDB]);
	return useObservableState(register$, null);
}
