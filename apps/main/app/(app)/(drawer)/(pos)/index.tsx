import React from 'react';

import { Redirect, useGlobalSearchParams, usePathname, useSegments } from 'expo-router';

import { useTheme } from '@wcpos/core/contexts/theme';

export default function IndexScreen() {
	const { screenSize } = useTheme();
	const pathname = usePathname();
	const segments = useSegments();
	const params = useGlobalSearchParams();

	console.log('[POS Index] ===================');
	console.log('[POS Index] screenSize:', screenSize);
	console.log('[POS Index] pathname:', pathname);
	console.log('[POS Index] segments:', segments);
	console.log('[POS Index] params:', params);

	// Initial redirect to the appropriate layout based on screen size
	if (screenSize === 'sm') {
		console.log('[POS Index] Redirecting to (tabs)');
		return <Redirect href="(tabs)" />;
	} else {
		console.log('[POS Index] Redirecting to (columns)');
		return <Redirect href="(columns)" />;
	}
}
