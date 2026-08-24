import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { DocsLink } from '@wcpos/components/docs-link';
import { HStack } from '@wcpos/components/hstack';
import { Input } from '@wcpos/components/input';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import type { ScannerProfileDocument } from '@wcpos/database';
import { isCanonicalUuid, normalizeUuid, scannerDeviceKey } from '@wcpos/scanner';
import { getErrorMessage } from '@wcpos/utils/logger';

import { useT } from '../../../../contexts/translations';
import { useDeviceScanControls } from '../../hooks/barcodes/scan-hub-context';
import { useScannerRegistration } from '../../hooks/barcodes/use-scanner-registration';
import { useCollection } from '../../hooks/use-collection';
import { ScannerDeviceChooser } from './scanner-device-chooser';
import { SettingsSection } from '../components/settings-section';

const NO_PROFILES: ScannerProfileDocument[] = [];
const WIZARD_DOCS_URL = 'https://docs.wcpos.com/hardware/scanner-setup-wizard';

/**
 * What a saved scanner's status line says.
 *
 * `keyboard` profiles never report a live link — the scanner types into the
 * Activity and is recognised per keystroke, so there is nothing to be connected
 * to. Saying "Connected" there would be a claim we cannot back; `registered` is
 * the whole truth about that lane.
 *
 * The wording of "not live" is transport-specific on purpose: "not in range" is
 * nonsense for a cable and "not plugged in" is nonsense for Bluetooth, and a
 * merchant reads either as broken if it names the wrong thing.
 */
type ScannerStatus =
	'connected' | 'registered' | 'not_in_range' | 'not_plugged_in' | 'disconnected';

export function scannerStatus(
	connectionType: ScannerProfileDocument['connectionType'],
	live: boolean
): ScannerStatus {
	if (connectionType === 'keyboard') {
		return 'registered';
	}
	if (live) {
		return 'connected';
	}
	switch (connectionType) {
		case 'usb-serial':
			return 'not_plugged_in';
		case 'bluetooth-spp':
		case 'bluetooth-le':
			return 'not_in_range';
		default:
			// hid-pos: WebHID reports no bus, so neither cable nor radio wording is
			// safe to assert.
			return 'disconnected';
	}
}

function ScannerProfileRow({
	profile,
	live,
	onRemove,
}: {
	profile: ScannerProfileDocument;
	live: boolean;
	onRemove: (profile: ScannerProfileDocument) => void;
}) {
	const t = useT();
	const status = scannerStatus(profile.connectionType, live);

	// Literal keys so the translations pipeline can find them.
	const typeLabel: Record<ScannerProfileDocument['connectionType'], string> = {
		keyboard: t('settings.scanner_type_keyboard'),
		'usb-serial': t('settings.scanner_type_usb_serial'),
		'bluetooth-spp': t('settings.scanner_type_bluetooth_spp'),
		'bluetooth-le': t('settings.scanner_type_bluetooth_le'),
		'hid-pos': t('settings.scanner_type_hid_pos'),
	};
	const statusLabel: Record<ScannerStatus, string> = {
		connected: t('settings.scanner_status_connected'),
		registered: t('settings.scanner_status_registered'),
		not_in_range: t('settings.scanner_status_not_in_range'),
		not_plugged_in: t('settings.scanner_status_not_plugged_in'),
		disconnected: t('settings.scanner_status_disconnected'),
	};
	const detail =
		profile.vendorId !== undefined && profile.productId !== undefined
			? `${profile.vendorId}:${profile.productId}`
			: profile.serviceUuid;
	const identity = detail
		? `${typeLabel[profile.connectionType]} · ${detail}`
		: typeLabel[profile.connectionType];
	// "Not in range" is the normal state of a scanner sitting on a shelf — muted,
	// never destructive. Only a live link earns colour.
	const tone = status === 'connected' ? 'text-success' : 'text-muted-foreground';

	return (
		<HStack
			className="border-border items-center gap-3 rounded-md border p-2"
			testID="scanner-profile-row"
		>
			<View
				className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-success' : 'bg-muted-foreground/40'}`}
			/>
			<VStack className="flex-1" space="xs">
				<Text className="text-sm font-medium">
					{profile.name || profile.deviceName || typeLabel[profile.connectionType]}
				</Text>
				<Text className="text-muted-foreground font-mono text-xs">{identity}</Text>
			</VStack>
			<Text className={`text-2xs font-medium ${tone}`} testID="scanner-profile-status">
				{statusLabel[status]}
			</Text>
			{/* Quiet by design: a destructive-red button on every row is alarm for a
			    list, not emphasis. ghost-quiet keeps the surface clear and
			    de-emphasises only the label. */}
			<Button
				variant="ghost-quiet"
				size="sm"
				testID="scanner-profile-delete"
				onPress={() => onRemove(profile)}
			>
				<ButtonText>{t('settings.scanner_remove')}</ButtonText>
			</Button>
		</HStack>
	);
}

/**
 * Scanner input sources (architecture: wcpos/monorepo#715).
 *
 * Deliberately quiet when empty: the overwhelmingly common setup is a scanner
 * paired as a Bluetooth or USB keyboard, which needs nothing configured here.
 * The direct-connection apparatus is real but advanced, so it lives behind a
 * disclosure rather than behind two filled buttons that read as required steps.
 * Saved scanners stay OUTSIDE that disclosure — adding one is advanced, seeing
 * and removing what you already have is not.
 */
export function InputSources() {
	const t = useT();
	const { collection } = useCollection('scanner_profiles');
	const profiles = useObservableState(
		React.useMemo(() => collection.find().$, [collection]),
		NO_PROFILES
	) as ScannerProfileDocument[];
	const registration = useScannerRegistration();
	const { serial, hid, ble } = useDeviceScanControls();
	const [name, setName] = React.useState('');
	const [serviceUuid, setServiceUuid] = React.useState('');
	const [serviceUuidInvalid, setServiceUuidInvalid] = React.useState(false);

	const liveKeys = React.useMemo(
		() =>
			new Set(
				[serial.connectedDeviceKey, hid.connectedDeviceKey, ble.connectedDeviceKey].filter(
					(key): key is string => typeof key === 'string'
				)
			),
		[serial.connectedDeviceKey, hid.connectedDeviceKey, ble.connectedDeviceKey]
	);

	const canConnectDirectly = serial.available || hid.available || ble.available;

	// The section renders if any input source can be added on this platform.
	if (!registration.available && !canConnectDirectly) {
		return null;
	}

	// Android registers a keyboard-mode scanner by device identity; it never
	// "connects" to anything. Different verb, different explainer.
	const registrationLane = registration.available && !canConnectDirectly;

	const handleSave = async () => {
		try {
			await registration.save(name);
			setName('');
			Toast.show({ type: 'success', title: t('settings.scanner_registered'), duration: 2500 });
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

	const handleAddServiceUuid = async () => {
		const normalized = normalizeUuid(serviceUuid);
		if (!isCanonicalUuid(normalized)) {
			setServiceUuidInvalid(true);
			return;
		}
		setServiceUuidInvalid(false);
		const deviceKey = scannerDeviceKey({
			connectionType: 'bluetooth-spp',
			serviceUuid: normalized,
		});
		if (profiles.some((profile) => profile.deviceKey === deviceKey)) {
			Toast.show({
				type: 'info',
				title: t('settings.scanner_bluetooth_uuid_duplicate'),
				duration: 2500,
			});
			return;
		}
		try {
			// Upsert on the canonical key: a second Add press while the first is in
			// flight is now idempotent rather than a duplicate row, so this needs no
			// in-flight guard.
			await collection.upsert({
				deviceKey,
				name: '',
				connectionType: 'bluetooth-spp',
				// No platform-reported name exists for a hand-entered UUID. Storing
				// the translated label here would freeze today's UI language into
				// the document; the row derives its label from connectionType.
				deviceName: '',
				serviceUuid: normalized,
				createdAt: new Date().toISOString(),
			});
			setServiceUuid('');
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

	const midFlow = registration.available && (registration.capturing || !!registration.candidate);

	return (
		<SettingsSection
			testID="barcode-input-sources"
			title={t('settings.scanner_section')}
			description={profiles.length === 0 ? t('settings.scanner_keyboard_mode_intro') : undefined}
		>
			<VStack space="sm" className="pt-1">
				{profiles.length === 0 && !midFlow ? (
					<Text className="text-sm font-medium" testID="scanner-no-setup-needed">
						{t('settings.scanner_no_setup_needed')}
					</Text>
				) : null}

				{/* Mid-flow replaces the list: one thing is happening, so one thing shows. */}
				{midFlow ? null : (
					<>
						{profiles.map((profile) => (
							<ScannerProfileRow
								key={profile.deviceKey}
								profile={profile}
								live={liveKeys.has(profile.deviceKey)}
								onRemove={handleRemove}
							/>
						))}
						{profiles.length > 0 ? (
							<Text className="text-muted-foreground text-xs" testID="scanner-registered-hint">
								{registrationLane
									? t('settings.scanner_registered_hint_keyboard')
									: t('settings.scanner_registered_hint')}
							</Text>
						) : null}
					</>
				)}

				<DocsLink testID="scanner-setup-guide-link" href={WIZARD_DOCS_URL}>
					{t('settings.scanner_setup_guide')}
				</DocsLink>

				{midFlow ? null : (
					<Collapsible className="border-border/50 mt-1 border-t pt-3">
						<CollapsibleTrigger testID="scanner-advanced-trigger">
							<Text className="text-primary text-sm font-medium">
								{registrationLane
									? profiles.length > 0
										? t('settings.scanner_advanced_register_more')
										: t('settings.scanner_advanced_register')
									: profiles.length > 0
										? t('settings.scanner_advanced_connect_more')
										: t('settings.scanner_advanced_connect')}
							</Text>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<VStack space="sm" testID="scanner-advanced-content">
								<Text className="text-muted-foreground text-xs">
									{registrationLane
										? t('settings.scanner_register_explainer')
										: t('settings.scanner_direct_explainer')}
								</Text>

								{canConnectDirectly ? (
									<HStack space="sm" testID="add-scanner-direct">
										{hid.available ? (
											<Button
												size="sm"
												variant="outline"
												onPress={() => (hid.connected ? hid.disconnect() : hid.connect())}
												testID="hid-connect-button"
											>
												<ButtonText>
													{hid.connected
														? t('settings.scanner_usb_disconnect')
														: t('settings.scanner_connect_usb')}
												</ButtonText>
											</Button>
										) : null}
										{serial.available ? (
											<Button
												size="sm"
												variant="outline"
												onPress={() => (serial.connected ? serial.disconnect() : serial.connect())}
												testID="serial-connect-button"
											>
												<ButtonText>
													{serial.connected
														? t('settings.scanner_bluetooth_serial_disconnect')
														: t('settings.scanner_connect_bluetooth_serial')}
												</ButtonText>
											</Button>
										) : null}
										{ble.available ? (
											<Button
												size="sm"
												variant="outline"
												onPress={() => (ble.connected ? ble.disconnect() : ble.connect())}
												testID="ble-connect-button"
											>
												<ButtonText>
													{ble.connected
														? t('settings.scanner_bluetooth_le_disconnect')
														: t('settings.scanner_connect_bluetooth_le')}
												</ButtonText>
											</Button>
										) : null}
									</HStack>
								) : null}

								{registration.available ? (
									<View className="items-start">
										<Button
											size="sm"
											variant="outline"
											onPress={registration.start}
											testID="register-scanner-button"
										>
											<ButtonText>{t('settings.scanner_register')}</ButtonText>
										</Button>
									</View>
								) : null}

								{canConnectDirectly ? (
									<View testID="scanner-keyboard-wall-note">
										<Text className="text-muted-foreground text-xs">
											{t('settings.scanner_keyboard_wall_note')}
										</Text>
									</View>
								) : null}

								{/* Manual UUID entry is the "my scanner isn't listed" escape hatch —
								    a 128-bit UUID is plumbing, and surfacing it by default made the
								    whole section read as a required setup form. */}
								{serial.available ? (
									<Collapsible testID="bluetooth-service-class-id-control">
										<CollapsibleTrigger testID="scanner-uuid-trigger">
											<Text className="text-primary text-xs font-medium">
												{t('settings.scanner_uuid_disclosure')}
											</Text>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<VStack space="xs">
												<HStack space="sm">
													<Input
														className="flex-1 font-mono"
														value={serviceUuid}
														onChangeText={(value) => {
															setServiceUuid(value);
															setServiceUuidInvalid(false);
														}}
														placeholder={t('settings.scanner_bluetooth_uuid_placeholder')}
														testID="bluetooth-service-class-id-input"
													/>
													<Button
														size="sm"
														variant="outline"
														onPress={handleAddServiceUuid}
														testID="bluetooth-service-class-id-add"
													>
														<ButtonText>{t('settings.scanner_bluetooth_uuid_add')}</ButtonText>
													</Button>
												</HStack>
												{serviceUuidInvalid ? (
													<Text
														className="text-destructive text-xs"
														testID="bluetooth-service-class-id-error"
													>
														{t('settings.scanner_bluetooth_uuid_invalid')}
													</Text>
												) : null}
												<DocsLink
													testID="bluetooth-service-class-id-docs-link"
													href={WIZARD_DOCS_URL}
												>
													{t('settings.scanner_bluetooth_uuid_docs_link')}
												</DocsLink>
											</VStack>
										</CollapsibleContent>
									</Collapsible>
								) : null}
							</VStack>
						</CollapsibleContent>
					</Collapsible>
				)}

				{/* Electron surfaces its serial/HID chooser candidates here; inert elsewhere. */}
				<ScannerDeviceChooser />

				{registration.available && registration.candidate ? (
					<VStack space="sm" className="border-info/40 bg-info/10 rounded-md border p-2">
						<Text className="text-sm">
							{t('settings.scanner_detected', {
								deviceName: registration.candidate.deviceName,
							})}
						</Text>
						<Input
							value={name}
							onChangeText={setName}
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
				) : null}
			</VStack>
		</SettingsSection>
	);
}
