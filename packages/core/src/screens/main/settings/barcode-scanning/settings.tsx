import * as React from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Form,
	FormField,
	FormInput,
	FormSwitch,
	useFormChangeHandler,
} from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';
import { Slider } from '@wcpos/components/slider';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { Platform } from '@wcpos/utils/platform';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { FormErrors } from '../../components/form-errors';
import { playScanFailure, playScanSuccess } from '../../pos/products/play-scan-sound';
import {
	DEFAULT_SCAN_SOUND_VOLUME,
	MAX_SCAN_SOUND_VOLUME,
	MIN_SCAN_SOUND_VOLUME,
	SCAN_SOUND_THEMES,
	type ScanSoundTheme,
} from '../../pos/products/scan-sound-themes';
import { SettingsRow } from '../components/settings-row';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

const formSchema = z.object({
	barcode_scanning_avg_time_input_threshold: z.number().default(24),
	// barcode_scanning_buffer: z.number().default(500),
	barcode_scanning_min_chars: z.number().default(8),
	barcode_scanning_prefix: z.string().default(''),
	barcode_scanning_suffix: z.string().default(''),
	barcode_scanning_sound_enabled: z.boolean().default(false),
	barcode_scanning_sound_theme: z.enum(['classic', 'checkout', 'soft']).default('classic'),
	barcode_scanning_sound_volume: z.number().default(DEFAULT_SCAN_SOUND_VOLUME),
	barcode_scanning_sound_success_enabled: z.boolean().default(true),
	barcode_scanning_sound_failure_enabled: z.boolean().default(true),
	barcode_scanning_sound_haptic_enabled: z.boolean().default(true),
});

/**
 *
 */
export function BarcodeSettings() {
	const { store } = useAppState();
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const formData = useDocField(store, (latest) => {
		return {
			barcode_scanning_avg_time_input_threshold: latest.barcode_scanning_avg_time_input_threshold,
			barcode_scanning_min_chars: latest.barcode_scanning_min_chars,
			barcode_scanning_prefix: latest.barcode_scanning_prefix || '',
			barcode_scanning_suffix: latest.barcode_scanning_suffix || '',
			barcode_scanning_sound_enabled: latest.barcode_scanning_sound_enabled ?? false,
			barcode_scanning_sound_theme: (latest.barcode_scanning_sound_theme ??
				'classic') as ScanSoundTheme,
			barcode_scanning_sound_volume:
				latest.barcode_scanning_sound_volume ?? DEFAULT_SCAN_SOUND_VOLUME,
			barcode_scanning_sound_success_enabled: latest.barcode_scanning_sound_success_enabled ?? true,
			barcode_scanning_sound_failure_enabled: latest.barcode_scanning_sound_failure_enabled ?? true,
			barcode_scanning_sound_haptic_enabled: latest.barcode_scanning_sound_haptic_enabled ?? true,
		};
	});

	/**
	 * Use `values` instead of `defaultValues` + useEffect reset pattern.
	 * This makes the form reactive to external data changes (react-hook-form best practice).
	 */
	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema as never) as never,
		values: formData,
	});

	/**
	 * Handle form changes and persist to store
	 */
	const handleChange = React.useCallback(
		async (data: z.infer<typeof formSchema>) => {
			await localPatch({
				document: store,
				data,
			});
		},
		[localPatch, store]
	);

	useFormChangeHandler({
		form: form as never,
		onChange: handleChange as never,
	});

	const soundEnabled = form.watch('barcode_scanning_sound_enabled');

	// Literal keys so the translations pipeline can find them.
	const themeCopy: Record<ScanSoundTheme, { label: string; desc: string }> = {
		classic: {
			label: t('settings.barcode_sound_theme_classic'),
			desc: t('settings.barcode_sound_theme_classic_desc'),
		},
		checkout: {
			label: t('settings.barcode_sound_theme_checkout'),
			desc: t('settings.barcode_sound_theme_checkout_desc'),
		},
		soft: {
			label: t('settings.barcode_sound_theme_soft'),
			desc: t('settings.barcode_sound_theme_soft_desc'),
		},
	};

	/**
	 * Previews play through the same platform module as real scan feedback, at
	 * the currently selected volume — what you hear is what a scan sounds like.
	 */
	const previewSuccess = React.useCallback(
		(theme: ScanSoundTheme) => {
			playScanSuccess({ theme, volume: form.getValues('barcode_scanning_sound_volume') });
		},
		[form]
	);
	const previewFailure = React.useCallback(
		(theme: ScanSoundTheme) => {
			playScanFailure({
				theme,
				volume: form.getValues('barcode_scanning_sound_volume'),
				haptic: false,
			});
		},
		[form]
	);

	/**
	 *
	 */
	return (
		<Form {...form}>
			<VStack className="gap-1">
				<FormErrors />
				<FormField
					control={form.control}
					name="barcode_scanning_avg_time_input_threshold"
					render={({ field: { value, ...rest } }) => (
						<SettingsRow label={t('settings.barcode_average_time_input_threshold_ms')}>
							<FormInput
								type="numeric"
								value={value != null ? String(value) : undefined}
								{...rest}
							/>
						</SettingsRow>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_min_chars"
					render={({ field: { value, ...rest } }) => (
						<SettingsRow label={t('settings.barcode_minimum_length')}>
							<FormInput
								type="numeric"
								value={value != null ? String(value) : undefined}
								{...rest}
							/>
						</SettingsRow>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_prefix"
					render={({ field }) => (
						<SettingsRow label={t('settings.barcode_scanner_prefix')}>
							<FormInput {...field} />
						</SettingsRow>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_suffix"
					render={({ field }) => (
						<SettingsRow label={t('settings.barcode_scanner_suffix')}>
							<FormInput {...field} />
						</SettingsRow>
					)}
				/>
				<FormField
					control={form.control}
					name="barcode_scanning_sound_enabled"
					render={({ field }) => (
						<SettingsRow inline label={t('settings.barcode_scan_sound')}>
							<FormSwitch {...field} />
						</SettingsRow>
					)}
				/>

				{soundEnabled ? (
					<VStack
						space="sm"
						className="border-border mt-1 rounded-md border p-3"
						testID="scan-sound-options"
					>
						<FormField
							control={form.control}
							name="barcode_scanning_sound_theme"
							render={({ field }) => (
								<VStack space="xs">
									<Text className="text-sm font-medium">{t('settings.barcode_sound_theme')}</Text>
									<RadioGroup value={field.value} onValueChange={field.onChange}>
										{SCAN_SOUND_THEMES.map((theme) => (
											<HStack key={theme} space="sm" className="items-center">
												<RadioGroupOption value={theme} label={themeCopy[theme].label} />
												<Text className="text-muted-foreground flex-1 text-xs">
													{themeCopy[theme].desc}
												</Text>
												<Button
													variant="outline"
													size="sm"
													onPress={() => previewSuccess(theme)}
													testID={`sound-preview-success-${theme}`}
													aria-label={t('settings.barcode_sound_preview_success')}
												>
													<ButtonText>▶</ButtonText>
												</Button>
												<Button
													variant="outline"
													size="sm"
													onPress={() => previewFailure(theme)}
													testID={`sound-preview-failure-${theme}`}
													aria-label={t('settings.barcode_sound_preview_failure')}
												>
													<ButtonText>▶✕</ButtonText>
												</Button>
											</HStack>
										))}
									</RadioGroup>
								</VStack>
							)}
						/>
						<FormField
							control={form.control}
							name="barcode_scanning_sound_volume"
							render={({ field }) => (
								<HStack space="sm" className="items-center">
									<Text className="text-sm font-medium">{t('settings.barcode_sound_volume')}</Text>
									<VStack className="flex-1 px-2">
										<Slider
											value={field.value}
											onValueChange={field.onChange}
											min={MIN_SCAN_SOUND_VOLUME}
											max={MAX_SCAN_SOUND_VOLUME}
											step={0.05}
										/>
									</VStack>
									<Button
										variant="outline"
										size="sm"
										onPress={() => previewSuccess(form.getValues('barcode_scanning_sound_theme'))}
										testID="sound-preview-volume"
										aria-label={t('settings.barcode_sound_preview_success')}
									>
										<ButtonText>▶</ButtonText>
									</Button>
								</HStack>
							)}
						/>
						<FormField
							control={form.control}
							name="barcode_scanning_sound_success_enabled"
							render={({ field }) => (
								<SettingsRow inline label={t('settings.barcode_sound_success')}>
									<FormSwitch {...field} />
								</SettingsRow>
							)}
						/>
						<FormField
							control={form.control}
							name="barcode_scanning_sound_failure_enabled"
							render={({ field }) => (
								<SettingsRow inline label={t('settings.barcode_sound_failure')}>
									<FormSwitch {...field} />
								</SettingsRow>
							)}
						/>
						{Platform.OS !== 'web' ? (
							<FormField
								control={form.control}
								name="barcode_scanning_sound_haptic_enabled"
								render={({ field }) => (
									<SettingsRow inline label={t('settings.barcode_sound_haptic')}>
										<FormSwitch {...field} />
									</SettingsRow>
								)}
							/>
						) : null}
					</VStack>
				) : null}
			</VStack>
		</Form>
	);
}
