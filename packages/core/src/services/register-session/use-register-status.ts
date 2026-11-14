import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map, of } from 'rxjs';

import { useDocField } from '@wcpos/query';
import { observeRegisterStatus } from '@wcpos/query/register-session';

import { useOverdue } from './use-register-session';
import { useStoreSession } from '../../contexts/app-state';
import { useRegisterBinding } from '../register/use-register-binding';

/** The bound register's current session and whether it is overdue, without its drawer figures. */
export function useRegisterStatus() {
	const { store, storeDB } = useStoreSession();
	const { registerId } = useRegisterBinding();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const status$ = React.useMemo(
		() =>
			!registerId || !sessionsOn
				? of(null)
				: observeRegisterStatus(storeDB, registerId).pipe(
						map((status) => status && { ...status, storeDB, registerId })
					),
		[storeDB, registerId, sessionsOn]
	);
	const observed = useObservableState(status$, null);
	// An answer for another store, register or collection generation is not this register's.
	const data =
		observed?.storeDB === storeDB &&
		observed.registerId === registerId &&
		observed.isCurrent() &&
		sessionsOn
			? observed
			: null;
	const session = data?.session ?? null;
	const { overdue } = useOverdue(session);
	return { session, sessionsOn, loaded: !sessionsOn || data !== null, overdue, registerId };
}
