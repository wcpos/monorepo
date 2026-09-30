import * as React from 'react';
import { Pressable } from 'react-native';

import { Uniwind, useUniwind } from 'uniwind';

import { Icon, IconName } from '@wcpos/components/icon';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';

import { SavedFieldProvider, SavedMark, useMarkSaved } from './components/saved-mark';
import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';

type ThemeOption = {
	name: string;
	labelKey: string;
	icon: IconName;
	descriptionKey: string;
};

/**
 * Single theme button. Isolated so the parent doesn't need `useUniwind()`.
 */
function ThemeOptionButton({
	option,
	activeTheme,
	onPress,
	t,
}: {
	option: ThemeOption;
	activeTheme: string;
	onPress: (name: string) => Promise<void> | void;
	t: ReturnType<typeof useT>;
}) {
	const isActive = activeTheme === option.name;
	return (
		<Pressable
			testID={`theme-option-${option.name}`}
			onPress={() => {
				void onPress(option.name);
			}}
			accessibilityRole="button"
			accessibilityState={{ selected: isActive }}
			aria-selected={isActive}
			// min-h-40 clears the tallest possible card — icon + 2-line label cap
			// + 2-line description cap (≈9.4rem) — so all six tiles match across
			// rows, locales, and widths, not just within a stretched row.
			className={`bg-card min-h-40 flex-1 items-center justify-center gap-2 rounded-lg border p-3 ${
				isActive ? 'border-primary' : 'border-border'
			}`}
		>
			{isActive && <Icon name="check" size="sm" className="text-primary absolute top-2 right-2" />}
			<Icon
				name={option.icon}
				size="xl"
				className={isActive ? 'text-primary' : 'text-muted-foreground'}
			/>
			<Text
				className={`text-center text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}
				numberOfLines={2}
			>
				{t(option.labelKey)}
			</Text>
			<Text className="text-muted-foreground text-center text-xs" numberOfLines={2}>
				{t(option.descriptionKey)}
			</Text>
		</Pressable>
	);
}

/**
 * Renders the theme grid + status text. Isolated so that calling
 * `useUniwind()` here does not cause the whole `ThemeSettings` (or its
 * parent modal) to re-render during a theme change — which would cancel
 * Uniwind's theme transition.
 */
function ThemeGrid({
	themeOptions,
	onThemeChange,
	t,
}: {
	themeOptions: ThemeOption[];
	onThemeChange: (name: string) => void;
	t: ReturnType<typeof useT>;
}) {
	const { theme, hasAdaptiveThemes } = useUniwind();
	const activeTheme = hasAdaptiveThemes ? 'system' : theme;
	const activeThemeLabel = t(
		themeOptions.find((option) => option.name === activeTheme)?.labelKey ?? activeTheme
	);

	return (
		<>
			<VStack className="gap-3 pt-2">
				{/* First row: System, Light, Dark. items-stretch so every card in a
				    row takes the tallest card's height (HStack defaults to
				    items-center, which lets short-description cards float shorter). */}
				<HStack className="items-stretch gap-3">
					{themeOptions.slice(0, 3).map((option) => (
						<ThemeOptionButton
							key={option.name}
							option={option}
							activeTheme={activeTheme as string}
							onPress={onThemeChange}
							t={t}
						/>
					))}
				</HStack>
				{/* Second row: Ocean, Sunset, Monochrome */}
				<HStack className="items-stretch gap-3">
					{themeOptions.slice(3, 6).map((option) => (
						<ThemeOptionButton
							key={option.name}
							option={option}
							activeTheme={activeTheme as string}
							onPress={onThemeChange}
							t={t}
						/>
					))}
				</HStack>
			</VStack>

			{/* Current theme status */}
			<Text className="text-muted-foreground text-xs">
				{hasAdaptiveThemes
					? t('settings.following_system_theme')
					: t('settings.current_theme', { theme: activeThemeLabel })}
			</Text>
			<SavedMark name="theme" />
		</>
	);
}

/** Auto first: it is the default, and the three steps override it. */
const SCALE_OPTIONS = ['auto', 'compact', 'regular', 'spacious'] as const;

/**
 * The Scale row. The step itself reaches the screens through `ScaleProvider`,
 * which reads this field off the store document — nothing here touches a token.
 */
function ScaleRow({ t }: { t: ReturnType<typeof useT> }) {
	const { store } = useStoreSession();
	const { localPatch } = useLocalMutation();
	const markSaved = useMarkSaved();
	const scale = useDocField(store, (latest) => latest.scale) ?? 'auto';

	const handleScaleChange = React.useCallback(
		async (value: string | undefined) => {
			if (!value) return;
			try {
				const result = await localPatch({ document: store, data: { scale: value } });
				if (result) markSaved(['scale']);
			} catch (error) {
				console.error('Failed to persist selected scale', error);
			}
		},
		[localPatch, store, markSaved]
	);

	return (
		<SettingsRow
			label={t('settings.scale')}
			description={t('settings.scale.description')}
			name="scale"
		>
			<SegmentedControl
				segments={
					SCALE_OPTIONS.map((option) => ({
						value: option,
						label: t(`settings.scale.${option}`),
						testID: `settings-scale-${option}`,
					})) as [Segment, Segment, Segment, Segment]
				}
				value={scale}
				onValueChange={(value) => {
					void handleScaleChange(value);
				}}
			/>
		</SettingsRow>
	);
}

/**
 * Theme Settings Component
 *
 * Allows users to switch between themes.
 * Persists theme selection to RxDB store document.
 */
export function ThemeSettings() {
	return (
		<SavedFieldProvider>
			<ThemeSettingsContent />
		</SavedFieldProvider>
	);
}

function ThemeSettingsContent() {
	const t = useT();
	const { store } = useStoreSession();
	const { localPatch } = useLocalMutation();
	const markSaved = useMarkSaved();

	/**
	 * Theme options following Uniwind's theming API
	 * @see https://docs.uniwind.dev/theming/basics
	 * @see https://docs.uniwind.dev/theming/custom-themes
	 */
	const themeOptions: ThemeOption[] = React.useMemo(
		() => [
			{
				name: 'system',
				labelKey: 'settings.theme.system',
				icon: 'circleHalfStroke',
				descriptionKey: 'settings.theme.system_description',
			},
			{
				name: 'light',
				labelKey: 'settings.theme.light',
				icon: 'sunBright',
				descriptionKey: 'settings.theme.light_description',
			},
			{
				name: 'dark',
				labelKey: 'settings.theme.dark',
				icon: 'moon',
				descriptionKey: 'settings.theme.dark_description',
			},
			{
				name: 'ocean',
				labelKey: 'settings.theme.ocean',
				icon: 'water',
				descriptionKey: 'settings.theme.ocean_description',
			},
			{
				name: 'sunset',
				labelKey: 'settings.theme.sunset',
				icon: 'sunHaze',
				descriptionKey: 'settings.theme.sunset_description',
			},
			{
				name: 'monochrome',
				labelKey: 'settings.theme.monochrome',
				icon: 'circleHalf',
				descriptionKey: 'settings.theme.monochrome_description',
			},
		],
		[]
	);

	/**
	 * Handle theme change using Uniwind's setTheme API
	 * Also persist to RxDB store document
	 */
	const handleThemeChange = React.useCallback(
		async (themeName: string) => {
			try {
				const result = await localPatch({
					document: store,
					data: { theme: themeName },
				});

				Uniwind.setTheme(themeName as any);
				if (result) markSaved(['theme']);
			} catch (error) {
				console.error('Failed to persist selected theme', error);
			}
		},
		[localPatch, store, markSaved]
	);

	return (
		<VStack className="gap-5">
			<SettingsSection
				first
				title={t('settings.appearance')}
				description={t('settings.choose_a_theme_for_the_app')}
			>
				<ThemeGrid themeOptions={themeOptions} onThemeChange={handleThemeChange} t={t} />
			</SettingsSection>
			{/* The row carries the label and the reason; a titled section would say Scale twice. */}
			<SettingsSection>
				<ScaleRow t={t} />
			</SettingsSection>
		</VStack>
	);
}
