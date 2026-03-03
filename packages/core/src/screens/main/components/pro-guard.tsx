import * as React from 'react';
import { Platform, View } from 'react-native';

import { useIsFocused } from '@react-navigation/native';
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
		const isFocused = useIsFocused();
		const [overlayKey, setOverlayKey] = React.useState(0);
		const blurTargetRef = React.useRef(null);

		// Remount overlay on each focus to reset any devtools DOM tampering
		React.useEffect(() => {
			if (isFocused) {
				setOverlayKey((k) => k + 1);
			}
		}, [isFocused]);

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
					key={overlayKey}
					page={page}
					blurTarget={Platform.OS === 'android' ? blurTargetRef : undefined}
				/>
			</View>
		);
	}

	return ProAccessWrapper;
};
