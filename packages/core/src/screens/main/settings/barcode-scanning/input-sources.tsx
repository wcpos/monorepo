import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import type { ScannerProfileDocument } from '@wcpos/database';

import { useT } from '../../../../contexts/translations';
import { useScannerRegistration } from '../../hooks/barcodes/use-scanner-registration';
import { useCollection } from '../../hooks/use-collection';

const NO_PROFILES: ScannerProfileDocument[] = [];

/**
 * Input sources for barcode scanning (architecture: wcpos/monorepo#715).
 * Android-only in v1: register a keyboard-mode scanner by its device identity
 * so its keys become attributed scan input with no timing heuristic.
 */
export function InputSources() {
	const t = useT();
	const { collection } = useCollection('scanner_profiles');
	const profiles = useObservableState(
		React.useMemo(() => collection.find().$, [collection]),
		NO_PROFILES
	) as ScannerProfileDocument[];
	const registration = useScannerRegistration();
	const [label, setLabel] = React.useState('');

	if (!registration.available) {
		return null;
	}

	const handleSave = async () => {
		await registration.save(label);
		setLabel('');
		Toast.show({
			type: 'success',
			title: t('settings.scanner_registered', { defaultValue: 'Scanner registered' }),
			duration: 2500,
		});
	};

	return (
		<VStack space="sm" testID="barcode-input-sources">
			<Text className="text-md font-bold">
				{t('settings.barcode_input_sources', { defaultValue: 'Registered scanners' })}
			</Text>
			<Text className="text-muted-foreground text-sm">
				{t('settings.barcode_input_sources_description', {
					defaultValue:
						'A registered scanner is recognised by its device identity — every scan from it is captured directly, with no typing-speed guesswork.',
				})}
			</Text>

			{profiles.map((profile) => (
				<HStack
					key={profile.id}
					className="border-border rounded-md border p-2"
					testID="scanner-profile-row"
				>
					<VStack className="flex-1" space="xs">
						<Text className="text-sm font-medium">{profile.label || profile.deviceName}</Text>
						<Text className="text-muted-foreground font-mono text-xs">
							{profile.deviceName} · {profile.vendorId}:{profile.productId}
						</Text>
					</VStack>
					<Button
						variant="destructive"
						size="sm"
						testID="scanner-profile-delete"
						onPress={() => profile.getLatest().remove()}
					>
						<ButtonText>{t('settings.scanner_remove', { defaultValue: 'Remove' })}</ButtonText>
					</Button>
				</HStack>
			))}

			{registration.candidate ? (
				<VStack space="sm" className="border-info/40 bg-info/10 rounded-md border p-2">
					<Text className="text-sm">
						{t('settings.scanner_detected', {
							deviceName: registration.candidate.deviceName,
							defaultValue: 'Detected "{deviceName}" — name it and save',
						})}
					</Text>
					<Input
						value={label}
						onChangeText={setLabel}
						placeholder={registration.candidate.deviceName}
						testID="scanner-label-input"
					/>
					<HStack space="sm">
						<Button size="sm" onPress={handleSave} testID="scanner-save-button">
							<ButtonText>
								{t('settings.scanner_save', { defaultValue: 'Save scanner' })}
							</ButtonText>
						</Button>
						<Button variant="outline" size="sm" onPress={registration.discard}>
							<ButtonText>{t('common.cancel')}</ButtonText>
						</Button>
					</HStack>
				</VStack>
			) : registration.capturing ? (
				<View className="border-info/40 bg-info/10 rounded-md border p-2">
					<HStack>
						<Text className="flex-1 text-sm">
							{t('settings.scanner_capture_prompt', {
								defaultValue: 'Scan any barcode now with the scanner you want to register…',
							})}
						</Text>
						<Button variant="outline" size="sm" onPress={registration.stop}>
							<ButtonText>{t('common.cancel')}</ButtonText>
						</Button>
					</HStack>
				</View>
			) : (
				<View className="items-start">
					<Button size="sm" onPress={registration.start} testID="register-scanner-button">
						<ButtonText>
							{t('settings.scanner_register', { defaultValue: 'Register scanner' })}
						</ButtonText>
					</Button>
				</View>
			)}
		</VStack>
	);
}
