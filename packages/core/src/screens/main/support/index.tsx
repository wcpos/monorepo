import React from 'react';
import { useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSpacingUnit } from '@wcpos/components/lib/use-spacing-unit';

import { useT } from '../../../contexts/translations';
import { useAppInfo } from '../../../hooks/use-app-info';
import { UpgradeNotice } from '../components/upgrade-notice';
import { UpgradeNoticeContext } from '../components/upgrade-notice/context';
import { ManagementBar } from '../components/management-bar';
import { adjustForPadding } from './adjust-for-padding';
import Discord from './discord';

export function Support() {
	const t = useT();
	const { license } = useAppInfo();
	const { showUpgrade, setShowUpgrade } = React.useContext(UpgradeNoticeContext);
	// The frame's `p-gutter` (three spacing units) in px at the live step, so the widget fills
	// the frame exactly.
	const gutter = 3 * useSpacingUnit();
	// The window seeds the size so the DOM component never mounts at 0×0; once
	// the frame reports its own layout that wins, and it reports again on
	// every rotation, so no separate dimension listener is needed.
	const window = useWindowDimensions();
	const [layout, setLayout] = React.useState<{ width: number; height: number } | null>(null);
	// The frame's size is kept raw and the gutter taken off at render: a step change moves the
	// padding without necessarily resizing the frame, so no new layout event would follow.
	const frame = layout ?? window;
	const dimensions = adjustForPadding(frame.width, frame.height, gutter);
	const { bottom } = useSafeAreaInsets();

	// Measures the frame under the bar (and the notice), not the whole screen, so the
	// embed never sizes itself to space the bar already takes.
	const handleLayout = (event: LayoutChangeEvent) => {
		const { width, height } = event.nativeEvent.layout;
		setLayout({ width, height });
	};

	return (
		<View
			testID="screen-support"
			className="bg-background flex-1"
			style={{ paddingBottom: bottom || undefined }}
		>
			<ManagementBar title={t('common.support')} testID="support-bar" />
			{showUpgrade && !license?.isPro && <UpgradeNotice setShowUpgrade={setShowUpgrade} underBar />}
			<View testID="support-frame" className="p-gutter min-h-0 flex-1" onLayout={handleLayout}>
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
