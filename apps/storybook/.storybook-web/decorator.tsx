import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { ThemeProvider } from 'styled-components/native';
import getTheme from '@wcpos/common/src/themes';

export default function (renderStory) {
	return (
		<React.Suspense fallback={<ActivityIndicator />}>
			<ThemeProvider theme={getTheme()}>
		    <View style={{ padding: '3em', flexDirection: 'row' }}>{renderStory()}</View>
	    </ThemeProvider>
		</React.Suspense>
	);
}