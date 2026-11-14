import React from 'react';

import { Redirect } from 'expo-router';

import { useIsPhone } from '@wcpos/components/lib/device';

export default function IndexScreen() {
	const phone = useIsPhone();

	// Initial redirect to the appropriate layout based on screen size
	if (phone) {
		return <Redirect href="/(app)/(drawer)/(pos)/(tabs)" />;
	} else {
		return <Redirect href="/(app)/(drawer)/(pos)/(columns)" />;
	}
}
