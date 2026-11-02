import * as React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SvgAlert } from '../icon/components/tabler/alert';
import { SvgInfo } from '../icon/components/tabler/info';
import { SvgWarning } from '../icon/components/tabler/warning';
import { useIsPhone } from '../lib/device';
import { Logo } from '../logo';
import { PRE_THEME_COLOURS as C, PRE_THEME_RADIUS } from './pre-theme-colours';

import type { GateScreenProps } from './index';

type Action = NonNullable<GateScreenProps['primary']>;
type PreThemeGateProps = Omit<GateScreenProps, 'icon' | 'docs'> & {
	/** One extra block under the line, such as a confirm's warning. */
	children?: React.ReactNode;
};

/**
 * The default icon set's (tabler) glyphs for the three tones, drawn by their generated components
 * with a `color` prop: `Icon` resolves its colour from a className, which does not resolve here.
 */
const tones = {
	warning: { disc: C.warningBg, glyph: C.warningText, Glyph: SvgWarning },
	bad: { disc: C.badBg, glyph: C.destructive, Glyph: SvgAlert },
	muted: { disc: C.muted, glyph: C.mutedForeground, Glyph: SvgInfo },
} as const;

/** The token sheet's base size: 14 on web, 16 on native (`text-base`). */
const BASE = Platform.OS === 'web' ? 14 : 16;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * `GateScreen`'s twin for the screens that render above every provider (the root error screen, the
 * blocked reset): no theme, no translations, so no className resolves. The same geometry in
 * StyleSheet numbers from `pre-theme-colours.ts`: the mark above one card at the sign-in
 * reading width (448), inset 32 (16 on a phone), a 56 tone disc, the title in foreground ink,
 * one muted line, the actions stacked full width. Like GateScreen it pads no safe area: the
 * centred content keeps the page gutter from every edge. Keep it in step with `GateScreen`.
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
	// GateScreen's own phone rule, so the twin changes inset and mark at the same width.
	const phone = useIsPhone();
	const style = tones[tone];
	const mark = phone ? 64 : 80;
	return (
		<ScrollView
			style={styles.screen}
			contentContainerStyle={styles.content}
			keyboardShouldPersistTaps="handled"
		>
			<View testID={testID} style={styles.column}>
				<Logo width={mark} height={mark} />
				<View style={[styles.card, { padding: phone ? 16 : 32 }]}>
					<View style={[styles.disc, { backgroundColor: style.disc }]}>
						<style.Glyph width={28} height={28} color={style.glyph} testID={`${testID}-glyph`} />
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
								<PreThemeButton
									action={primary}
									fill={primary.destructive ? 'destructive' : 'primary'}
									testID={`${testID}-primary`}
								/>
							) : null}
							{secondary ? (
								<PreThemeButton action={secondary} fill="outline" testID={`${testID}-secondary`} />
							) : null}
						</View>
					) : null}
				</View>
			</View>
		</ScrollView>
	);
}

/**
 * GateScreen's slots: the primary filled, the secondary outlined. A primary that confirms a loss
 * takes the Button's `destructive` fill and ink, as GateScreen's does.
 */
const fills = {
	primary: {
		button: { backgroundColor: C.primary },
		label: { color: C.primaryForeground, fontWeight: '600' },
	},
	destructive: {
		button: { backgroundColor: C.destructive },
		label: { color: C.destructiveForeground, fontWeight: '600' },
	},
	outline: {
		button: { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 },
		label: { color: C.foreground, fontWeight: '500' },
	},
} as const;

function PreThemeButton({
	action,
	fill,
	testID,
}: {
	action: Action;
	fill: keyof typeof fills;
	testID: string;
}) {
	return (
		<TouchableOpacity
			testID={action.testID ?? testID}
			accessibilityRole="button"
			accessibilityState={{ disabled: !!action.disabled }}
			disabled={action.disabled}
			onPress={action.onPress}
			style={[styles.button, fills[fill].button, action.disabled ? styles.disabled : null]}
		>
			{/* A gate's label wraps rather than truncates, as GateScreen's does. */}
			<Text style={[styles.label, fills[fill].label]}>{action.label}</Text>
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
	disabled: { opacity: 0.45 },
	label: { fontSize: BASE, textAlign: 'center' },
});
