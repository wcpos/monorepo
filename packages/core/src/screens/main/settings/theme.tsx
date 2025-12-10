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

/**
 * Theme Settings Component
 *
 * Allows users to switch between themes.
 * Persists theme selection to RxDB store document.
 */
export const ThemeSettings = () => {
	const t = useT();
	const { theme, hasAdaptiveThemes } = useUniwind();
	const { store } = useAppState();
	const { localPatch } = useLocalMutation();

	/**
	 * Theme options following Uniwind's theming API
	 * @see https://docs.uniwind.dev/theming/basics
	 * @see https://docs.uniwind.dev/theming/custom-themes
	 */
	const themeOptions: { name: string; labelKey: string; icon: IconName; descriptionKey: string }[] =
		React.useMemo(
			() => [
				{
					name: 'system',
					labelKey: 'System',
					icon: 'circleHalfStroke',
					descriptionKey: t('Follow your device settings', { _tags: 'core' }),
				},
				{
					name: 'light',
					labelKey: 'Light',
					icon: 'sunBright',
					descriptionKey: t('Clean and bright', { _tags: 'core' }),
				},
				{
					name: 'dark',
					labelKey: 'Dark',
					icon: 'moon',
					descriptionKey: t('Easy on the eyes', { _tags: 'core' }),
				},
				{
					name: 'ocean',
					labelKey: 'Ocean',
					icon: 'water',
					descriptionKey: t('Cool blues and teals', { _tags: 'core' }),
				},
				{
					name: 'sunset',
					labelKey: 'Sunset',
					icon: 'sunHaze',
					descriptionKey: t('Warm oranges and purples', { _tags: 'core' }),
				},
				{
					name: 'monochrome',
					labelKey: 'Monochrome',
					icon: 'circleHalf',
					descriptionKey: t('High contrast grayscale', { _tags: 'core' }),
				},
			],
			[t]
		);

	// Determine the active theme option
	// When hasAdaptiveThemes is true, we're following the system theme
	const activeTheme = hasAdaptiveThemes ? 'system' : theme;

	/**
	 * Handle theme change using Uniwind's setTheme API
	 * Also persist to RxDB store document
	 */
	const handleThemeChange = React.useCallback(
		async (themeName: string) => {
			// Update Uniwind theme
			Uniwind.setTheme(themeName);

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
				<Label className="text-base font-medium">{t('Appearance', { _tags: 'core' })}</Label>
				<Text className="text-muted-foreground text-sm">
					{t('Choose a theme for the app. Custom themes provide different color schemes.', {
						_tags: 'core',
					})}
				</Text>

				<VStack className="gap-3 pt-2">
					{/* First row: System, Light, Dark */}
					<HStack className="gap-3">
						{themeOptions.slice(0, 3).map((option) => (
							<Pressable
								key={option.name}
								onPress={() => handleThemeChange(option.name)}
								className={`flex-1 items-center gap-2 rounded-lg border-2 p-3 ${
									activeTheme === option.name
										? 'border-primary bg-primary/10'
										: 'border-border bg-card'
								}`}
							>
								<Icon
									name={option.icon}
									size="xl"
									className={activeTheme === option.name ? 'text-primary' : 'text-muted-foreground'}
								/>
								<Text
									className={`text-sm font-medium ${
										activeTheme === option.name ? 'text-primary' : 'text-foreground'
									}`}
								>
									{t(option.labelKey, { _tags: 'core' })}
								</Text>
								<Text className="text-muted-foreground text-center text-xs" numberOfLines={2}>
									{t(option.descriptionKey, { _tags: 'core' })}
								</Text>
							</Pressable>
						))}
					</HStack>
					{/* Second row: Ocean, Sunset, Monochrome */}
					<HStack className="gap-3">
						{themeOptions.slice(3, 6).map((option) => (
							<Pressable
								key={option.name}
								onPress={() => handleThemeChange(option.name)}
								className={`flex-1 items-center gap-2 rounded-lg border-2 p-3 ${
									activeTheme === option.name
										? 'border-primary bg-primary/10'
										: 'border-border bg-card'
								}`}
							>
								<Icon
									name={option.icon}
									size="xl"
									className={activeTheme === option.name ? 'text-primary' : 'text-muted-foreground'}
								/>
								<Text
									className={`text-sm font-medium ${
										activeTheme === option.name ? 'text-primary' : 'text-foreground'
									}`}
								>
									{t(option.labelKey, { _tags: 'core' })}
								</Text>
								<Text className="text-muted-foreground text-center text-xs" numberOfLines={2}>
									{t(option.descriptionKey, { _tags: 'core' })}
								</Text>
							</Pressable>
						))}
					</HStack>
				</VStack>

				{/* Current theme status */}
				<Text className="text-muted-foreground text-xs">
					{hasAdaptiveThemes
						? t('Following system theme', { _tags: 'core' })
						: t('Current theme: {theme}', { _tags: 'core', theme })}
				</Text>
			</VStack>

			{/* Footer */}
			<ModalFooter className="px-0">
				<ModalClose>{t('Close', { _tags: 'core' })}</ModalClose>
			</ModalFooter>
		</VStack>
	);
};
