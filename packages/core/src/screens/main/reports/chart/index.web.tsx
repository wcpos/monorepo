import React from 'react';

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

import { Text } from '@wcpos/components/text';

/**
 * Chart component using Victory Native XL
 */
export const Chart = () => {
	return (
		<WithSkiaWeb getComponent={() => import('./chart')} fallback={<Text>Loading Chart...</Text>} />
	);
};
