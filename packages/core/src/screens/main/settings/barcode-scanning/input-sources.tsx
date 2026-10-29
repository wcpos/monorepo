import * as React from 'react';
import { View } from 'react-native';

import { useObservableState } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { DeviceRow, DeviceRowActions } from '@wcpos/components/device-row';
import { DocsLink } from '@wcpos/components/docs-link';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@wcpos/components/dropdown-menu';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { IconButton } from '@wcpos/components/icon-button';
import { Notice } from '@wcpos/components/notice';
import { Input } from '@wcpos/components/input';
import { PropertyRow, PropertyVerb } from '@wcpos/components/property-row';
import { Text } from '@wcpos/components/text';
import { Toast } from '@wcpos/components/toast';
import { VStack } from '@wcpos/components/vstack';
import {
	observeScannerProfiles,
	removeScannerProfile,
	saveScannerProfile,
	type ScannerProfile,
} from '@wcpos/query/store-local';
import { isCanonicalUuid, normalizeUuid, scannerDeviceKey } from '@wcpos/scanner';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import { useDeviceScanControls } from '../../hooks/barcodes/scan-hub-context';
import { useScannerRegistration } from '../../hooks/barcodes/use-scanner-registration';
import { useAppState } from '../../../../contexts/app-state';
import { ScannerDeviceChooser } from './scanner-device-chooser';
import { SettingsSection } from '../components/settings-section';

const NO_PROFILES: ScannerProfile[] = [];
const scannerSettingsLogger = getLogger(['wcpos', 'settings', 'scanners']);

/**
 * A scanner profile is a local database write: one SYNC101 row, whose own summary
 * and hint are the toast. The raw RxDB message stays in the row, never as the
 * toast's only sentence under a bare "Error" title.
 */
function reportScannerSettingFailure(action: string, error: unknown): void {
	scannerSettingsLogger.error('Scanner setting could not be saved', {
		code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
		showToast: true,
		context: { action, error: getErrorMessage(error) },
	});
}
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
	connectionType: ScannerProfile['connectionType'],
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
	profile: ScannerProfile;
	live: boolean;
	onRemove: (profile: ScannerProfile) => void;
}) {
	const t = useT();
	const status = scannerStatus(profile.connectionType, live);

	// Literal keys so the translations pipeline can find them.
	const typeLabel: Record<ScannerProfile['connectionType'], string> = {
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
	return (
		<DeviceRow
			testID="scanner-profile-row"
			icon="barcode"
			name={profile.name || profile.deviceName || typeLabel[profile.connectionType]}
			identifiers={[typeLabel[profile.connectionType], detail]}
			// "Not in range" is the normal state of a scanner sitting on a shelf — muted,
			// never destructive. Only a live link earns colour.
			state={{
				label: statusLabel[status],
				tone: status === 'connected' ? 'ok' : 'muted',
				testID: 'scanner-profile-status',
			}}
		>
			<DeviceRowActions>
				{/* Removing a scanner is the row's only action and it loses the pairing: the last,
				    red row of the row's ⋮ menu, never a red button on every row of a list. */}
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<IconButton
							name="more"
							testID="scanner-profile-menu"
							accessibilityLabel={t('common.actions')}
						/>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							variant="destructive"
							testID="scanner-profile-delete"
							onPress={() => onRemove(profile)}
						>
							<Icon name="delete" className="fill-destructive" />
							<Text>{t('settings.scanner_remove')}</Text>
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</DeviceRowActions>
		</DeviceRow>
	);
}

/** The Direct connection row and its sheet: connecting a scanner directly is a task of its own. */
function DirectConnection(props: {
	label: string;
	none: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	children: React.ReactNode;
}) {
	const t = useT();
	return (
		<Dialog open={props.open} onOpenChange={props.onOpenChange}>
			<PropertyRow
				testID="scanner-row-direct"
				label={t('settings.scanner_direct_connection')}
				verb={
					// The verb is the dialog's trigger, so closing the sheet returns focus to it.
					<DialogTrigger asChild>
						<PropertyVerb testID="scanner-advanced-trigger">{props.label}</PropertyVerb>
					</DialogTrigger>
				}
			>
				{props.none ? <Text className="text-muted-foreground">{t('common.none')}</Text> : null}
			</PropertyRow>
			<DialogContent side="right" size="lg" closeLabel={t('common.close')}>
				<DialogHeader>
					<DialogTitle>{props.label}</DialogTitle>
				</DialogHeader>
				{props.children}
				<DialogFooter close />
			</DialogContent>
		</Dialog>
	);
}

/**
 * Scanner input sources (architecture: wcpos/monorepo#715).
 *
 * Deliberately quiet when empty: the overwhelmingly common setup is a scanner
 * paired as a Bluetooth or USB keyboard, which needs nothing configured here.
 * The direct-connection apparatus is real but advanced, so it lives in the
 * Direct connection sheet rather than behind two filled buttons that read as
 * required steps. Saved scanners stay OUTSIDE that sheet — adding one is
 * advanced, seeing and removing what you already have is not.
 */
export function InputSources() {
	const t = useT();
	const { storeDB } = useAppState();
	const profiles = useObservableState(
		React.useMemo(() => observeScannerProfiles(storeDB), [storeDB]),
		NO_PROFILES
	);
	const registration = useScannerRegistration();
	const { serial, hid, ble } = useDeviceScanControls();
	const [name, setName] = React.useState('');
	const [serviceUuid, setServiceUuid] = React.useState('');
	const [serviceUuidInvalid, setServiceUuidInvalid] = React.useState(false);
	const [sheetOpen, setSheetOpen] = React.useState(false);

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
			await registration.register(name);
			setName('');
			Toast.show({ type: 'success', title: t('settings.scanner_registered'), duration: 2500 });
		} catch (error) {
			reportScannerSettingFailure('register', error);
		}
	};

	const handleRemove = async (profile: ScannerProfile) => {
		try {
			await removeScannerProfile(storeDB, profile.deviceKey);
		} catch (error) {
			reportScannerSettingFailure('remove', error);
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
			await saveScannerProfile(storeDB, {
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
			reportScannerSettingFailure('add-bluetooth-uuid', error);
		}
	};

	const midFlow = registration.available && (registration.capturing || !!registration.candidate);
	// A registration started from the sheet continues inline: the sheet gives way to it.
	if (midFlow && sheetOpen) setSheetOpen(false);

	return (
		<SettingsSection
			testID="barcode-input-sources"
			title={t('settings.scanner_section')}
			description={profiles.length === 0 ? t('settings.scanner_keyboard_mode_intro') : undefined}
		>
			<VStack space="sm" className="pt-1">
				{profiles.length === 0 && !midFlow ? (
					<Text variant="subheading" testID="scanner-no-setup-needed">
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
							<Text variant="help" testID="scanner-registered-hint">
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
					<DirectConnection
						label={
							registrationLane
								? profiles.length > 0
									? t('settings.scanner_advanced_register_more')
									: t('settings.scanner_advanced_register')
								: profiles.length > 0
									? t('settings.scanner_advanced_connect_more')
									: t('settings.scanner_advanced_connect')
						}
						none={profiles.length === 0}
						open={sheetOpen}
						onOpenChange={setSheetOpen}
					>
						<DialogBody>
							<VStack space="sm" testID="scanner-advanced-content">
								<Text variant="help">
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
										<Text variant="help">{t('settings.scanner_keyboard_wall_note')}</Text>
									</View>
								) : null}

								{/* Electron answers a connect press with its serial/HID chooser: it lives in the
								    sheet that asked, so the pick is in reach and closing the sheet cancels the
								    pending request (the chooser replies on unmount). Inert elsewhere. */}
								<ScannerDeviceChooser />

								{/* Manual UUID entry is the "my scanner isn't listed" escape hatch —
								    a 128-bit UUID is plumbing, so it sits last in the sheet as a
								    labelled block (rule 9), never on the page itself. */}
								{serial.available ? (
									<View testID="bluetooth-service-class-id-control">
										<VStack space="xs">
											<Text variant="subheading">{t('settings.scanner_uuid_disclosure')}</Text>
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
													className="text-bad text-xs"
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
									</View>
								) : null}
							</VStack>
						</DialogBody>
					</DirectConnection>
				)}

				{registration.available && registration.candidate ? (
					<VStack space="sm">
						<Notice
							tone="info"
							title={t('settings.scanner_detected', {
								deviceName: registration.candidate.deviceName,
							})}
						/>
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
					<Notice
						tone="info"
						title={t('settings.scanner_capture_prompt')}
						actions={[{ label: t('common.cancel'), onPress: registration.stop }]}
					/>
				) : null}
			</VStack>
		</SettingsSection>
	);
}
