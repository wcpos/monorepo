import * as React from 'react';
import { Platform, View } from 'react-native';

import { BlurTargetView } from 'expo-blur';

import { ProAccessProvider } from '../contexts/pro-access';
import { useLicense } from '../hooks/use-license';
import { ProPreviewOverlay } from './pro-preview-overlay';

type ProPage = 'products' | 'orders' | 'customers' | 'reports';

export const withProAccess = <P extends object>(
	WrappedComponent: React.ComponentType<P>,
	page: ProPage
) => {
	function ProAccessWrapper(props: P) {
		const { isPro } = useLicense();
		const blurTargetRef = React.useRef(null);

		if (isPro) {
			return (
				<ProAccessProvider value={{ readOnly: false }}>
					<WrappedComponent {...props} />
				</ProAccessProvider>
			);
		}

		// Free user: render real page with blur overlay
		const content = (
			<ProAccessProvider value={{ readOnly: true }}>
				<WrappedComponent {...props} />
			</ProAccessProvider>
		);

		return (
			<View style={{ flex: 1 }}>
				{Platform.OS === 'android' ? (
					<BlurTargetView ref={blurTargetRef} style={{ flex: 1 }}>
						{content}
					</BlurTargetView>
				) : (
					content
				)}
				<ProPreviewOverlay
					page={page}
					blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
				/>
			</View>
		);
	}

	return ProAccessWrapper;
};
