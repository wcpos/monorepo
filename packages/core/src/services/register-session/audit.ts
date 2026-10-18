import * as React from 'react';

import { useStoreSession } from '../../contexts/app-state';

export { recordRegisterFact, type RegisterFact } from '@wcpos/query/register-session';

export function useRegisterActor() {
	const { wpCredentials } = useStoreSession();
	return React.useMemo(
		() => ({
			id: String(wpCredentials?.id ?? ''),
			name: wpCredentials?.display_name || wpCredentials?.username || '',
		}),
		[wpCredentials?.id, wpCredentials?.display_name, wpCredentials?.username]
	);
}
