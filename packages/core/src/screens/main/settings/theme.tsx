import * as React from 'react';
import { Pressable } from 'react-native';

import { Uniwind, useUniwind } from 'uniwind';

import { Icon, IconName } from '@wcpos/components/icon';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { ModalClose, ModalFooter } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useAppState } from '../../../contexts/app-state';
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
	onPress: (name: string) => void;
	t: ReturnType<typeof useT>;
}) {
	const isActive = activeTheme === option.name;
	return (
		<Pressable
			onPress={() => onPress(option.name)}
			className={`flex-1 items-center gap-2 rounded-lg border-2 p-3 ${
				isActive ? 'border-primary bg-primary/10' : 'border-border bg-card'
			}`}
		>
			<Icon
				name={option.icon}
				size="xl"
				className={isActive ? 'text-primary' : 'text-muted-foreground'}
			/>
			<Text className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
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

	return (
		<>
			<VStack className="gap-3 pt-2">
				{/* First row: System, Light, Dark */}
				<HStack className="gap-3">
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
				<HStack className="gap-3">
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
					: t('settings.current_theme', { theme })}
			</Text>
		</>
	);
}

/**
 * Theme Settings Component
 *
 * Allows users to switch between themes.
 * Persists theme selection to RxDB store document.
 */
export function ThemeSettings() {
	const t = useT();
	const { store } = useAppState();
	const { localPatch } = useLocalMutation();

	/**
	 * Theme options following Uniwind's theming API
	 * @see https://docs.uniwind.dev/theming/basics
	 * @see https://docs.uniwind.dev/theming/custom-themes
	 */
	const themeOptions: ThemeOption[] = React.useMemo(
		() => [
			{
				name: 'system',
				labelKey: 'System',
				icon: 'circleHalfStroke',
				descriptionKey: 'Follow your device settings',
			},
			{
				name: 'light',
				labelKey: 'Light',
				icon: 'sunBright',
				descriptionKey: 'Clean and bright',
			},
			{
				name: 'dark',
				labelKey: 'Dark',
				icon: 'moon',
				descriptionKey: 'Easy on the eyes',
			},
			{
				name: 'ocean',
				labelKey: 'Ocean',
				icon: 'water',
				descriptionKey: 'Cool blues and teals',
			},
			{
				name: 'sunset',
				labelKey: 'Sunset',
				icon: 'sunHaze',
				descriptionKey: 'Warm oranges and purples',
			},
			{
				name: 'monochrome',
				labelKey: 'Monochrome',
				icon: 'circleHalf',
				descriptionKey: 'High contrast grayscale',
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
			// Update Uniwind theme
			Uniwind.setTheme(themeName as any);

			// Persist to RxDB
			await localPatch({
				document: store,
				data: { theme: themeName },
			});
		},
		[localPatch, store]
	);

	return (
		<VStack className="gap-6">
			{/* Appearance Section */}
			<VStack className="gap-3">
				<Label className="text-base font-medium">{t('settings.appearance')}</Label>
				<Text className="text-muted-foreground text-sm">
					{t('settings.choose_a_theme_for_the_app')}
				</Text>

				<ThemeGrid themeOptions={themeOptions} onThemeChange={handleThemeChange} t={t} />
			</VStack>

			{/* Footer */}
			<ModalFooter className="px-0">
				<ModalClose>{t('common.close')}</ModalClose>
			</ModalFooter>
		</VStack>
	);
}
