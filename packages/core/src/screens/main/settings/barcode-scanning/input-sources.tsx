import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';
import { v4 as uuidv4 } from 'uuid';

import { Button, ButtonText } from '@wcpos/components/button';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import type { ScannerProfileDocument } from '@wcpos/database';
import { getErrorMessage } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { useDeviceScanControls } from '../../hooks/barcodes/scan-hub-context';
import { useScannerRegistration } from '../../hooks/barcodes/use-scanner-registration';
import { useCollection } from '../../hooks/use-collection';
import { ScannerDeviceChooser } from './scanner-device-chooser';
import { SettingsSection } from '../components/settings-section';

const NO_PROFILES: ScannerProfileDocument[] = [];
const WIZARD_DOCS_URL = 'https://docs.wcpos.com/hardware/scanner-setup-wizard';
const BLUETOOTH_SERVICE_CLASS_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Secondary identity line for a saved profile: USB vid:pid, BT UUID, or nothing. */
function profileIdentity(profile: ScannerProfileDocument, bluetoothDeviceName: string): string {
	const deviceName = profile.bluetoothServiceClassId ? bluetoothDeviceName : profile.deviceName;
	if (profile.vendorId !== undefined && profile.productId !== undefined) {
		return `${deviceName} · ${profile.vendorId}:${profile.productId}`;
	}
	if (profile.bluetoothServiceClassId) {
		return `${deviceName} · ${profile.bluetoothServiceClassId}`;
	}
	return deviceName;
}

/**
 * Input sources for barcode scanning (architecture: wcpos/monorepo#715).
 * Android-only in v1: register a keyboard-mode scanner by its device identity
 * so its keys become attributed scan input with no timing heuristic.
 */
export function InputSources() {
	const t = useT();
	const bluetoothDeviceName = t('settings.scanner_bluetooth_serial');
	const { collection } = useCollection('scanner_profiles');
	const profiles = useObservableState(
		React.useMemo(() => collection.find().$, [collection]),
		NO_PROFILES
	) as ScannerProfileDocument[];
	const registration = useScannerRegistration();
	const { serial, hid } = useDeviceScanControls();
	const [label, setLabel] = React.useState('');
	const [bluetoothServiceClassId, setBluetoothServiceClassId] = React.useState('');
	const [bluetoothServiceClassIdInvalid, setBluetoothServiceClassIdInvalid] = React.useState(false);

	// The section renders if any input source can be added on this platform:
	// the attributed wedge (Android) or a direct Web Serial / WebHID connection.
	if (!registration.available && !serial.available && !hid.available) {
		return null;
	}

	const handleSave = async () => {
		try {
			await registration.save(label);
			setLabel('');
			Toast.show({
				type: 'success',
				title: t('settings.scanner_registered'),
				duration: 2500,
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.error'),
				description: getErrorMessage(error),
			});
		}
	};

	const handleRemove = async (profile: ScannerProfileDocument) => {
		try {
			await profile.getLatest().remove();
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.error'),
				description: getErrorMessage(error),
			});
		}
	};

	const handleAddBluetoothServiceClassId = async () => {
		const normalized = bluetoothServiceClassId.trim().toLowerCase();
		if (!BLUETOOTH_SERVICE_CLASS_ID_PATTERN.test(normalized)) {
			setBluetoothServiceClassIdInvalid(true);
			return;
		}

		setBluetoothServiceClassIdInvalid(false);
		const duplicate = profiles.some(
			(profile) =>
				profile.connectionType === 'serial' &&
				typeof profile.bluetoothServiceClassId === 'string' &&
				profile.bluetoothServiceClassId.toLowerCase() === normalized
		);
		if (duplicate) {
			Toast.show({
				type: 'info',
				title: t('settings.scanner_bluetooth_uuid_duplicate'),
				duration: 2500,
			});
			return;
		}

		try {
			await collection.insert({
				id: uuidv4(),
				label: '',
				connectionType: 'serial',
				deviceName: 'bluetooth-serial',
				bluetoothServiceClassId: normalized,
				createdAt: new Date().toISOString(),
			});
			setBluetoothServiceClassId('');
			Toast.show({
				type: 'success',
				title: t('settings.scanner_bluetooth_uuid_added'),
				duration: 2500,
			});
		} catch (error) {
			Toast.show({
				type: 'error',
				title: t('common.error'),
				description: getErrorMessage(error),
			});
		}
	};

	return (
		<SettingsSection
			testID="barcode-input-sources"
			title={t('settings.barcode_input_sources')}
			description={t('settings.barcode_input_sources_description')}
		>
			<VStack space="sm" className="pt-1">
				{serial.available || hid.available ? (
					<HStack space="sm" testID="add-scanner-direct">
						{serial.available ? (
							<Button
								size="sm"
								variant={serial.connected ? 'outline' : 'default'}
								onPress={() => (serial.connected ? serial.disconnect() : serial.connect())}
								testID="serial-connect-button"
							>
								<ButtonText>
									{serial.connected
										? t('settings.scanner_serial_disconnect')
										: t('settings.scanner_connect_serial')}
								</ButtonText>
							</Button>
						) : null}
						{hid.available ? (
							<Button
								size="sm"
								variant={hid.connected ? 'outline' : 'default'}
								onPress={() => (hid.connected ? hid.disconnect() : hid.connect())}
								testID="hid-connect-button"
							>
								<ButtonText>
									{hid.connected
										? t('settings.scanner_hid_disconnect')
										: t('settings.scanner_connect_hid')}
								</ButtonText>
							</Button>
						) : null}
					</HStack>
				) : null}

				{serial.available ? (
					<VStack space="xs" testID="bluetooth-service-class-id-control">
						<HStack space="sm">
							<Input
								className="flex-1 font-mono"
								value={bluetoothServiceClassId}
								onChangeText={(value) => {
									setBluetoothServiceClassId(value);
									setBluetoothServiceClassIdInvalid(false);
								}}
								placeholder={t('settings.scanner_bluetooth_uuid_placeholder')}
								testID="bluetooth-service-class-id-input"
							/>
							<Button
								size="sm"
								onPress={handleAddBluetoothServiceClassId}
								testID="bluetooth-service-class-id-add"
							>
								<ButtonText>{t('settings.scanner_bluetooth_uuid_add')}</ButtonText>
							</Button>
						</HStack>
						{bluetoothServiceClassIdInvalid ? (
							<Text className="text-destructive text-xs" testID="bluetooth-service-class-id-error">
								{t('settings.scanner_bluetooth_uuid_invalid')}
							</Text>
						) : null}
						<DocsLink testID="bluetooth-service-class-id-docs-link" href={WIZARD_DOCS_URL}>
							{t('settings.scanner_bluetooth_uuid_docs_link')}
						</DocsLink>
					</VStack>
				) : null}

				<VStack space="xs">
					{serial.available || hid.available ? (
						<View testID="scanner-mode-note">
							<Text className="text-muted-foreground text-xs">
								{t('settings.scanner_mode_note')}
							</Text>
						</View>
					) : null}
					{/* The wizard link renders on every platform with an input source —
					    on Android it is the only in-app pointer to scanner setup help. */}
					<DocsLink testID="scanner-mode-docs-link" href={WIZARD_DOCS_URL}>
						{t('settings.scanner_mode_docs_link')}
					</DocsLink>
				</VStack>

				{/* Electron surfaces its serial/HID chooser candidates here; inert elsewhere. */}
				<ScannerDeviceChooser />

				{profiles.map((profile) => (
					<HStack
						key={profile.id}
						className="border-border rounded-md border p-2"
						testID="scanner-profile-row"
					>
						<VStack className="flex-1" space="xs">
							<Text className="text-sm font-medium">
								{profile.label ||
									(profile.bluetoothServiceClassId ? bluetoothDeviceName : profile.deviceName)}
							</Text>
							<Text className="text-muted-foreground font-mono text-xs">
								{profileIdentity(profile, bluetoothDeviceName)}
							</Text>
						</VStack>
						<Button
							variant="destructive"
							size="sm"
							testID="scanner-profile-delete"
							onPress={() => handleRemove(profile)}
						>
							<ButtonText>{t('settings.scanner_remove')}</ButtonText>
						</Button>
					</HStack>
				))}

				{registration.available && registration.candidate ? (
					<VStack space="sm" className="border-info/40 bg-info/10 rounded-md border p-2">
						<Text className="text-sm">
							{t('settings.scanner_detected', {
								deviceName: registration.candidate.deviceName,
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
								<ButtonText>{t('settings.scanner_save')}</ButtonText>
							</Button>
							<Button variant="outline" size="sm" onPress={registration.discard}>
								<ButtonText>{t('common.cancel')}</ButtonText>
							</Button>
						</HStack>
					</VStack>
				) : registration.capturing ? (
					<View className="border-info/40 bg-info/10 rounded-md border p-2">
						<HStack>
							<Text className="flex-1 text-sm">{t('settings.scanner_capture_prompt')}</Text>
							<Button variant="outline" size="sm" onPress={registration.stop}>
								<ButtonText>{t('common.cancel')}</ButtonText>
							</Button>
						</HStack>
					</View>
				) : registration.available ? (
					<View className="items-start">
						<Button size="sm" onPress={registration.start} testID="register-scanner-button">
							<ButtonText>{t('settings.scanner_register')}</ButtonText>
						</Button>
					</View>
				) : null}
			</VStack>
		</SettingsSection>
	);
}
