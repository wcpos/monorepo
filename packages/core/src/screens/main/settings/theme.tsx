import * as React from 'react';
import { View } from 'react-native';

import { Uniwind, useUniwind } from 'uniwind';

import {
	Icon,
	ICON_SET_IDS,
	IconName,
	type IconSetId,
	IconSetProvider,
} from '@wcpos/components/icon';
import { HStack } from '@wcpos/components/hstack';
import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { Text } from '@wcpos/components/text';
import { Tile } from '@wcpos/components/tile';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';
import { patchStoreSettings } from '@wcpos/query/user-db';

import { SavedFieldProvider, SavedMark, useMarkSaved } from './components/saved-mark';
import { SettingsRow } from './components/settings-row';
import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { resolveIconSet } from '../../../contexts/icon-set';
import { useT } from '../../../contexts/translations';

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
		<Tile
			testID={`theme-option-${option.name}`}
			onPress={() => {
				void onPress(option.name);
			}}
			selected={isActive}
			// min-h-40 clears the tallest possible card — icon + 2-line label cap
			// + 2-line description cap (≈9.4rem) — so all six tiles match across
			// rows, locales, and widths, not just within a stretched row.
			className="min-h-40 flex-1 gap-2 p-3"
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
		</Tile>
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
			<View className="relative self-start">
				<Text className="text-muted-foreground text-xs">
					{hasAdaptiveThemes
						? t('settings.following_system_theme')
						: t('settings.current_theme', { theme: activeThemeLabel })}
				</Text>
				{/* Out of flow beside the status line: the Scale row below never moves. */}
				<View className="pointer-events-none absolute top-0 left-full ml-3 h-full justify-center">
					<SavedMark name="theme" />
				</View>
			</View>
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
	const markSaved = useMarkSaved();
	const scale = useDocField(store, (latest) => latest.scale) ?? 'auto';

	const handleScaleChange = React.useCallback(
		async (value: string | undefined) => {
			if (!value) return;
			try {
				const result = await patchStoreSettings(store, { scale: value }, t);
				if (result) markSaved(['scale']);
			} catch (error) {
				console.error('Failed to persist selected scale', error);
			}
		},
		[t, store, markSaved]
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

/** Six glyphs met on every screen, enough to judge a family at a glance. */
const ICON_SAMPLES: IconName[] = [
	'cart',
	'search',
	'viewGrid',
	'viewList',
	'settings',
	'confirmed',
];

/**
 * The Icons section: one row per candidate family, its samples drawn in that
 * family. The choice reaches the screens through `IconSetSettingProvider`.
 */
function IconsSection({ t }: { t: ReturnType<typeof useT> }) {
	const { store } = useStoreSession();
	const markSaved = useMarkSaved();
	const icons = resolveIconSet(useDocField(store, (latest) => latest.icons));

	const handleIconsChange = React.useCallback(
		async (value: IconSetId) => {
			try {
				const result = await patchStoreSettings(store, { icons: value }, t);
				if (result) markSaved(['icons']);
			} catch (error) {
				console.error('Failed to persist selected icons', error);
			}
		},
		[t, store, markSaved]
	);

	return (
		<SettingsSection title={t('settings.icons')}>
			<View className="relative self-start">
				<Text className="text-muted-foreground text-xs">{t('settings.icons.description')}</Text>
				{/* Out of flow beside the description, like the theme's: the rows never move. */}
				<View className="pointer-events-none absolute top-0 left-full ml-3 h-full justify-center">
					<SavedMark name="icons" />
				</View>
			</View>
			{/* The shared radio group: on web it is Radix, so Tab lands once, arrows move
			    and Space selects; the radio dot is the selected state. */}
			<RadioGroup
				value={icons}
				onValueChange={(value) => {
					void handleIconsChange(value as IconSetId);
				}}
				aria-label={t('settings.icons')}
				className="gap-0 pt-2"
			>
				{ICON_SET_IDS.map((id) => (
					<RadioGroupOption
						key={id}
						value={id}
						testID={`settings-icons-${id}`}
						label={t(`settings.icons.${id}`)}
						className="items-center py-2"
						labelClassName="text-sm font-medium"
						// One line at every width: radio, label and a 160 px strip fit a phone.
						right={
							<IconSetProvider set={id}>
								<HStack className="ml-auto gap-2" testID={`settings-icons-${id}-samples`}>
									{ICON_SAMPLES.map((name) => (
										<Icon key={name} name={name} size="lg" className="text-foreground" />
									))}
								</HStack>
							</IconSetProvider>
						}
					/>
				))}
			</RadioGroup>
		</SettingsSection>
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
				icon: 'desktop',
				descriptionKey: 'settings.theme.system_description',
			},
			{
				name: 'light',
				labelKey: 'settings.theme.light',
				icon: 'sun',
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
				icon: 'wave',
				descriptionKey: 'settings.theme.ocean_description',
			},
			{
				name: 'sunset',
				labelKey: 'settings.theme.sunset',
				icon: 'sunset',
				descriptionKey: 'settings.theme.sunset_description',
			},
			{
				name: 'monochrome',
				labelKey: 'settings.theme.monochrome',
				icon: 'contrast',
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
				const result = await patchStoreSettings(store, { theme: themeName }, t);

				Uniwind.setTheme(themeName as any);
				if (result) markSaved(['theme']);
			} catch (error) {
				console.error('Failed to persist selected theme', error);
			}
		},
		[t, store, markSaved]
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
			<IconsSection t={t} />
		</VStack>
	);
}
