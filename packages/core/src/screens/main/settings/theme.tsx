import * as React from 'react';

import { Uniwind, useUniwind } from 'uniwind';

import {
	Icon,
	ICON_SET_IDS,
	ICON_SETTING_AUTO,
	IconName,
	type IconSetId,
	IconSetProvider,
} from '@wcpos/components/icon';
import { HStack } from '@wcpos/components/hstack';
import { iconSetForTheme } from '@wcpos/components/lib/themes';
import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { Tile } from '@wcpos/components/tile';
import { TileGrid } from '@wcpos/components/tile-grid';
import { type Segment, SegmentedControl } from '@wcpos/components/segmented-control';
import { VStack } from '@wcpos/components/vstack';
import { useDocField } from '@wcpos/query';
import { patchStoreSettings } from '@wcpos/query/user-db';
import { SavedFieldProvider, useMarkSaved } from '@wcpos/components/form';
import { PropertyRow } from '@wcpos/components/property-row';

import { SettingsSection } from './components/settings-section';
import { useStoreSession } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

type ThemeOption = {
	name: string;
	label: string;
	icon: IconName;
	description: string;
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
			// + 2-line description cap (≈9.4rem) — so all eight tiles match across
			// rows, locales, and widths, not just within a stretched row.
			className="min-h-40 gap-2 p-3"
			title={option.label}
			sub={option.description}
		>
			{isActive && <Icon name="check" size="sm" className="text-primary absolute top-2 right-2" />}
			<Icon
				name={option.icon}
				size="xl"
				className={isActive ? 'text-primary' : 'text-muted-foreground'}
			/>
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
	const activeThemeLabel = themeOptions.find((o) => o.name === activeTheme)?.label ?? activeTheme;

	// The status line keys the grid, and the grid's Saved mark sits on that line.
	return (
		<PropertyRow
			stacked
			name="theme"
			label={
				hasAdaptiveThemes
					? t('settings.following_system_theme')
					: t('settings.current_theme', { theme: activeThemeLabel })
			}
		>
			{/* System, Light, Dark; then Ocean, Sunset, Monochrome; then Paper till, Warm shop. */}
			<TileGrid columns={3} className="pt-2">
				{themeOptions.map((option) => (
					<ThemeOptionButton
						key={option.name}
						option={option}
						activeTheme={activeTheme as string}
						onPress={onThemeChange}
						t={t}
					/>
				))}
			</TileGrid>
		</PropertyRow>
	);
}

/** Auto first: it is the default, and the three steps override it. */
const SCALE_OPTIONS = ['auto', 'compact', 'regular', 'spacious'] as const;

/**
 * The Scale section, shaped as Icons is: a section title, then its description as the row
 * that carries the Saved mark. The step itself reaches the screens through `ScaleProvider`,
 * which reads this field off the store document — nothing here touches a token.
 */
function ScaleSection({ t }: { t: ReturnType<typeof useT> }) {
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
	const labels: Record<(typeof SCALE_OPTIONS)[number], string> = {
		auto: t('settings.scale.auto'),
		compact: t('settings.scale.compact'),
		regular: t('settings.scale.regular'),
		spacious: t('settings.scale.spacious'),
	};

	return (
		<SettingsSection title={t('settings.scale')}>
			<PropertyRow stacked name="scale" label={t('settings.scale.description')}>
				<SegmentedControl
					segments={
						SCALE_OPTIONS.map((option) => ({
							value: option,
							label: labels[option],
							testID: `settings-scale-${option}`,
						})) as [Segment, Segment, Segment, Segment]
					}
					value={scale}
					onValueChange={(value) => {
						void handleScaleChange(value);
					}}
				/>
			</PropertyRow>
		</SettingsSection>
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

const ICON_OPTIONS = [ICON_SETTING_AUTO, ...ICON_SET_IDS] as const;

/**
 * The Icons section: one row per candidate family, its samples drawn in that
 * family. The choice reaches the screens through `IconSetSettingProvider`.
 */
function IconsSection({ t }: { t: ReturnType<typeof useT> }) {
	const { store } = useStoreSession();
	const markSaved = useMarkSaved();
	const icons = useDocField(store, (latest) => latest.icons) ?? ICON_SETTING_AUTO;
	const theme = useDocField(store, (latest) => latest.theme);
	const labels: Record<IconSetId | typeof ICON_SETTING_AUTO, string> = {
		auto: t('settings.icons.auto'),
		tabler: t('settings.icons.tabler'),
		hugeicons: t('settings.icons.hugeicons'),
		phosphor: t('settings.icons.phosphor'),
	};

	const handleIconsChange = React.useCallback(
		async (value: IconSetId | typeof ICON_SETTING_AUTO) => {
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
			{/* The description keys the list, and the list's Saved mark sits on that line. */}
			<PropertyRow stacked name="icons" label={t('settings.icons.description')} />
			{/* The shared radio group: on web it is Radix, so Tab lands once, arrows move
			    and Space selects; the radio dot is the selected state. */}
			<RadioGroup
				value={icons}
				onValueChange={(value) => {
					void handleIconsChange(value as IconSetId | typeof ICON_SETTING_AUTO);
				}}
				aria-label={t('settings.icons')}
				className="gap-0 pt-2"
			>
				{ICON_OPTIONS.map((id) => (
					<RadioGroupOption
						key={id}
						value={id}
						testID={`settings-icons-${id}`}
						label={labels[id]}
						className="items-center py-2"
						labelClassName="text-sm font-medium"
						// One line at every width: radio, label and a 160 px strip fit a phone.
						right={
							<IconSetProvider set={id === ICON_SETTING_AUTO ? iconSetForTheme(theme) : id}>
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
				label: t('settings.theme.system'),
				icon: 'desktop',
				description: t('settings.theme.system_description'),
			},
			{
				name: 'light',
				label: t('settings.theme.light'),
				icon: 'sun',
				description: t('settings.theme.light_description'),
			},
			{
				name: 'dark',
				label: t('settings.theme.dark'),
				icon: 'moon',
				description: t('settings.theme.dark_description'),
			},
			{
				name: 'ocean',
				label: t('settings.theme.ocean'),
				icon: 'wave',
				description: t('settings.theme.ocean_description'),
			},
			{
				name: 'sunset',
				label: t('settings.theme.sunset'),
				icon: 'sunset',
				description: t('settings.theme.sunset_description'),
			},
			{
				name: 'monochrome',
				label: t('settings.theme.monochrome'),
				icon: 'contrast',
				description: t('settings.theme.monochrome_description'),
			},
			{
				name: 'paper',
				label: t('settings.theme.paper'),
				icon: 'receipt',
				description: t('settings.theme.paper_description'),
			},
			{
				name: 'warm',
				label: t('settings.theme.warm'),
				icon: 'store',
				description: t('settings.theme.warm_description'),
			},
		],
		[t]
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
			<ScaleSection t={t} />
			<IconsSection t={t} />
		</VStack>
	);
}
