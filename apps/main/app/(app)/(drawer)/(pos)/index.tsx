import React from 'react';
import { useWindowDimensions, Dimensions } from 'react-native';

import { Redirect, useSegments, Slot, useRouter } from 'expo-router';

export default function IndexScreen() {
	const dimensions = useWindowDimensions();
	const segments = useSegments();
	const router = useRouter();
	console.log('dimensions', dimensions);
	console.log('segments', segments);

	/**
	 * @TODO - why doesn't this work??
	 */
	React.useEffect(() => {
		// Log initial dimensions
		console.log('Initial dimensions:', {
			width: Dimensions.get('window').width,
			height: Dimensions.get('window').height,
		});

		const subscription = Dimensions.addEventListener('change', ({ window }) => {
			console.log('Dimension changed:', {
				width: window.width,
				height: window.height,
			});
		});

		return () => subscription.remove();
	}, []);

	console.log('before redirect');

	// if (dimensions.width <= 640 && segments.includes('(columns)')) {
	// 	debugger;
	// 	const newPath = segments
	// 		.map((segment) => (segment === '(columns)' ? '(tabs)' : segment))
	// 		.join('/');
	// 	return router.replace(newPath);
	// }

	if (dimensions.width <= 640) {
		return <Redirect href="(tabs)" />;
	}

	if (dimensions.width > 640) {
		return <Redirect href="(columns)" />;
	}

	console.log('after redirect');
	return <Slot />;
}
