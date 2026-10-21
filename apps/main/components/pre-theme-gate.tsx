import * as React from 'react';
import {
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	useWindowDimensions,
	View,
} from 'react-native';

import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { G, Path } from 'react-native-svg';

import { isPhoneWindow } from '@wcpos/components/lib/device';
import { Logo } from '@wcpos/components/logo';
import type { GateScreenProps } from '@wcpos/components/gate-screen';

import { PRE_THEME_COLOURS as C, PRE_THEME_RADIUS } from './pre-theme-colours';

type Action = NonNullable<GateScreenProps['primary']>;
type PreThemeGateProps = Omit<GateScreenProps, 'icon' | 'docs'> & {
	/** One extra block under the line, such as a confirm's warning. */
	children?: React.ReactNode;
};

/**
 * The default icon set's (tabler) glyphs for the three tones, copied from
 * `packages/components/src/icon/components/tabler/{warning,alert,info}.tsx`: `Icon` resolves
 * its colour from a className, which does not resolve here. `pre-theme-gate.test.tsx` pins them.
 */
const GLYPHS = {
	warning: [
		'M12 9v4m-1.637-9.409L2.257 17.125a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636-2.87L13.637 3.59a1.914 1.914 0 0 0-3.274 0M12 16h.01',
	],
	alert: ['M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-4v4m0 4h.01'],
	info: ['M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0m9-3h.01', 'M11 12h1v4h1'],
} as const;

const tones = {
	warn: { disc: C.warnBg, glyph: C.warnText, icon: 'warning' },
	bad: { disc: C.badBg, glyph: C.bad, icon: 'alert' },
	muted: { disc: C.muted, glyph: C.mutedForeground, icon: 'info' },
} as const;

/** The token sheet's base size: 14 on web, 16 on native (`text-base`). */
const BASE = Platform.OS === 'web' ? 14 : 16;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * `GateScreen` for the screens that render above every provider (the root error screen, the
 * blocked reset): no theme, no translations, so no className resolves. The same geometry in
 * StyleSheet numbers from `pre-theme-colours.ts`: the mark above one card at the sign-in
 * reading width (448), inset 32 (16 on a phone), a 56 tone disc, the title in foreground ink,
 * one muted line, the actions stacked full width. Keep it in step with `GateScreen`.
 */
export function PreThemeGate({
	tone,
	title,
	description,
	detail,
	primary,
	secondary,
	children,
	testID = 'pre-theme-gate',
}: PreThemeGateProps) {
	const phone = isPhoneWindow(useWindowDimensions());
	const style = tones[tone];
	const mark = phone ? 64 : 80;
	return (
		<SafeAreaView style={styles.screen}>
			<ScrollView
				style={styles.screen}
				contentContainerStyle={styles.content}
				keyboardShouldPersistTaps="handled"
			>
				<View testID={testID} style={styles.column}>
					<Logo width={mark} height={mark} />
					<View style={[styles.card, { padding: phone ? 16 : 32 }]}>
						<View style={[styles.disc, { backgroundColor: style.disc }]}>
							<Svg width={28} height={28} viewBox="0 0 24 24" testID={`${testID}-glyph`}>
								<G
									fill="none"
									stroke={style.glyph}
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
								>
									{GLYPHS[style.icon].map((d) => (
										<Path key={d} d={d} />
									))}
								</G>
							</Svg>
						</View>
						<Text testID={`${testID}-title`} role="heading" style={styles.title}>
							{title}
						</Text>
						{description ? (
							<Text testID={`${testID}-description`} style={styles.line}>
								{description}
							</Text>
						) : null}
						{detail ? (
							<Text testID={`${testID}-detail`} selectable style={styles.detail}>
								{detail}
							</Text>
						) : null}
						{children}
						{primary || secondary ? (
							<View style={styles.actions}>
								{primary ? (
									<PreThemeButton action={primary} primary testID={`${testID}-primary`} />
								) : null}
								{secondary ? (
									<PreThemeButton action={secondary} testID={`${testID}-secondary`} />
								) : null}
							</View>
						) : null}
					</View>
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}

function PreThemeButton({
	action,
	primary = false,
	testID,
}: {
	action: Action;
	primary?: boolean;
	testID: string;
}) {
	return (
		<TouchableOpacity
			testID={action.testID ?? testID}
			accessibilityRole="button"
			accessibilityState={{ disabled: !!action.disabled }}
			disabled={action.disabled}
			onPress={action.onPress}
			style={[
				styles.button,
				primary ? styles.buttonPrimary : styles.buttonOutline,
				action.disabled ? styles.disabled : null,
			]}
		>
			{/* A gate's label wraps rather than truncates, as GateScreen's does. */}
			<Text style={[styles.label, primary ? styles.labelPrimary : styles.labelOutline]}>
				{action.label}
			</Text>
		</TouchableOpacity>
	);
}

/** A paragraph inside a pre-theme gate's card (the `children` slot): the muted line's ink. */
export function PreThemeParagraph({
	children,
	testID,
}: React.PropsWithChildren<{ testID?: string }>) {
	return (
		<Text testID={testID} style={styles.line}>
			{children}
		</Text>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: C.background },
	// The page gutter (16) at the screen edge, as sign-in and GateScreen.
	content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
	column: { width: '100%', alignItems: 'center', gap: 16 },
	card: {
		width: '100%',
		maxWidth: 448,
		alignItems: 'center',
		gap: 16,
		backgroundColor: C.card,
		borderColor: C.border,
		borderWidth: 1,
		borderRadius: PRE_THEME_RADIUS,
	},
	disc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
	title: {
		color: C.foreground,
		fontSize: 20,
		lineHeight: 28,
		fontWeight: '600',
		textAlign: 'center',
	},
	line: { color: C.mutedForeground, fontSize: BASE, textAlign: 'center' },
	detail: {
		width: '100%',
		color: C.mutedForeground,
		backgroundColor: C.muted,
		borderRadius: PRE_THEME_RADIUS - 2,
		paddingHorizontal: 12,
		paddingVertical: 8,
		fontFamily: MONO,
		fontSize: 12,
	},
	actions: { width: '100%', gap: 8 },
	button: {
		width: '100%',
		minHeight: 44,
		borderRadius: PRE_THEME_RADIUS,
		paddingHorizontal: 16,
		paddingVertical: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	buttonPrimary: { backgroundColor: C.primary },
	buttonOutline: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 },
	disabled: { opacity: 0.45 },
	label: { fontSize: BASE, textAlign: 'center' },
	labelPrimary: { color: C.primaryForeground, fontWeight: '600' },
	labelOutline: { color: C.foreground, fontWeight: '500' },
});
