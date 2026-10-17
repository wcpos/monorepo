import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { UpgradeNotice } from '../components/upgrade-notice';
import { UpgradeNoticeContext } from '../components/upgrade-notice/context';
import { ManagementBar } from '../components/management-bar';
import Discord from './discord';

// Helper to account for padding (p-2 = 8px on each side)
const adjustForPadding = (width: number, height: number) => {
	const paddingHorizontal = 16; // 8px on each side
	const paddingVertical = 16; // 8px on each side
	return {
		width: Math.max(0, width - paddingHorizontal),
		height: Math.max(0, height - paddingVertical),
	};
};

export function Support() {
	const t = useT();
	const { license } = useAppInfo();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	// The window seeds the size so the DOM component never mounts at 0×0; once
	// the frame reports its own layout that wins, and it reports again on
	// every rotation, so no separate dimension listener is needed.
	const window = useWindowDimensions();
	const [layout, setLayout] = React.useState<{ width: number; height: number } | null>(null);
	const dimensions = layout ?? adjustForPadding(window.width, window.height);
	const { bottom } = useSafeAreaInsets();

	// Measures the frame under the bar (and the notice), not the whole screen, so the
	// embed never sizes itself to space the bar already takes.
	const handleLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setLayout(adjustForPadding(width, height));
	};

	return (
		<View
			testID="screen-support"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			<ManagementBar title={t('common.support')} testID="support-bar" />
			{showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} />}
			<View testID="support-frame" className="min-h-0 flex-1 p-2" onLayout={handleLayout}>
				<Discord
					dom={{
						matchContents: true,
						scrollEnabled: false,
						containerStyle: {
							width: dimensions.width,
							height: dimensions.height,
						},
					}}
					width={dimensions.width}
					height={dimensions.height}
				/>
			</View>
		</View>
	);
}
