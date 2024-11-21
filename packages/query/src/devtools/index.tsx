import * as React from 'react';

import { Devtools } from './devtools';

export const QueryDevtools =
	process.env.NODE_ENV !== 'development'
		? () => null
		: () => {
				const [shouldRenderChild, setShouldRenderChild] = React.useState(false);

				React.useEffect(() => {
					setShouldRenderChild(true);
				}, []);

				return shouldRenderChild && <Devtools />;
			};
