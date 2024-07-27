import * as React from 'react';
import type { SuspenseProps } from 'react';

import DevSuspense from './suspense';

export const Suspense = (props: SuspenseProps) => {
	if (process.env.NODE_ENV === 'development') {
		return <DevSuspense {...props} />;
	} else {
		return <React.Suspense {...props} />;
	}
};
