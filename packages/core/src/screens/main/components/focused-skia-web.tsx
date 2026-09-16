import * as React from 'react';

import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import { useIsFocused } from 'expo-router/react-navigation';

type Props = React.ComponentProps<typeof WithSkiaWeb>;

/**
 * On web, react-native-skia 2.6.2's canvas view re-arms requestAnimationFrame every frame for
 * as long as it is mounted, whether or not anything redraws. The drawer keeps blurred screens
 * mounted, so two idle Health trend lines kept a 120 Hz frame loop alive under the POS screen
 * (a merchant's tab at 30-50% CPU, measured 2026-09-16). A canvas therefore renders only while
 * its screen is focused; the caller's `fallback` (the chart's own frame) holds the layout
 * otherwise, exactly as it does while CanvasKit loads.
 *
 * Not fixed in the library: @expo/fingerprint hashes the whole installed Skia directory, so a
 * pnpm patch of even its `.web.` files moves the native fingerprint and the OTA runtime
 * version. Upstream's fix (Shopify/react-native-skia#3933 + #4035, in v2.11.2) arrives with
 * the Skia bump on `next`; this wrapper stays useful either way.
 */
export function FocusedSkiaWeb(props: Props) {
	const isFocused = useIsFocused();
	if (!isFocused) return <>{props.fallback ?? null}</>;
	return <WithSkiaWeb {...props} />;
}
