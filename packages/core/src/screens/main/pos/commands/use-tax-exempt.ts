import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';

export function useWcVersion() {
	const { site } = useStoreSession();
	const wcVersion = useDocField(site, (v) => v.wc_version);
	const ref = React.useRef(wcVersion);
	// Queued commands read the version from the latest committed render.
	React.useLayoutEffect(() => {
		ref.current = wcVersion;
	}, [wcVersion]);
	return React.useCallback(() => ref.current ?? '', []);
}
