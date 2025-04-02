import React from 'react';

import { Redirect } from 'expo-router';

import { useTheme } from '@wcpos/core/contexts/theme';

export default function IndexScreen() {
	const { screenSize } = useTheme();

	if (screenSize === 'sm') {
		return <Redirect href="(tabs)" />;
	} else {
		return <Redirect href="(columns)" />;
	}
}
