import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';

import { useStoreSession } from '../../contexts/app-state';
import { useRestHttpClient } from '../../screens/main/hooks/use-rest-http-client';
import { useRegister } from './use-register';
import { registerWithServer } from './register-with-server';

export function useRegisterWithServer(): void {
	const { userDB, site, store, wpCredentials } = useStoreSession();
	const name = useRegister()?.name;
	const http = useRestHttpClient();
	const { status } = useOnlineStatus();
	const attempted = React.useRef<string | null>(null);
	// External session/connectivity subscription: one attempt, deferred until online.
	// useOnlineStatus owns the subscription and React cleans it up on unmount.
	React.useEffect(() => {
		const session = `${site.uuid}:${store.id}:${wpCredentials.uuid}:${name}`;
		if (status !== 'online-website-available' || attempted.current === session) return;
		attempted.current = session;
		void registerWithServer({ userDB, http, siteUuid: site.uuid! });
	}, [userDB, http, site.uuid, store.id, wpCredentials.uuid, status, name]);
}
