import * as React from 'react';

import { OnlineStatusContext } from './provider';

const useOnlineStatus = () => {
	const context = React.useContext(OnlineStatusContext);

	if (context === undefined) {
		throw new Error(`useOnlineStatus must be called within OnlineStatusProvider`);
	}

	return context;
};

export default useOnlineStatus;
