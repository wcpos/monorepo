import React from 'react';

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { version } from 'canvaskit-wasm/package.json';

import { Text } from '@wcpos/components/text';

/**
 * Chart component using Victory Native XL
 *
 * NOTE: wrap this component in memo to stop the Cannot read properties of null (reading 'rangeMin') error
 * https://github.com/Shopify/react-native-skia/issues/1629
 */
export const Chart = React.memo(() => {
	return (
		<WithSkiaWeb
			opts={{
				locateFile: (file) =>
					`https://cdn.jsdelivr.net/npm/canvaskit-wasm@${version}/bin/full/${file}`,
			}}
			getComponent={() => import('./chart')}
			fallback={<Text>Loading Chart...</Text>}
		/>
	);
});

Chart.displayName = 'Chart';
