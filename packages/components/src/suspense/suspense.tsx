import * as React from 'react';
import type { SuspenseProps } from 'react';

import { Text } from '../text';

const DevSuspense = ({ fallback, children }: SuspenseProps) => {
	const renderCount = React.useRef(0);

	React.useEffect(() => {
		renderCount.current += 1;

		if (process.env.NODE_ENV === 'development' && renderCount.current > 5) {
			// Arbitrary limit, adjust to your needs.
			console.warn(
				'Suspense fallback component has rendered more than 5 times. This might indicate a problem.'
			);
		}
	}, []);

	return <React.Suspense fallback={<Text>Loading ...</Text>}>{children}</React.Suspense>;
};

export default DevSuspense;
