/**
 * Local barcode-scanner profiles.
 *
 * `deviceKey` is the primary key: one canonical, normalized identity string
 * composed by `scannerDeviceKey()` in @wcpos/scanner. Making it the primary key
 * is what enforces "one profile per device" — RxDB rejects the duplicate insert,
 * so no lane needs a read-then-insert dup check or an in-flight guard.
 *
 * Every other identity field here is DISPLAY data. Nothing matches on them.
 */
export const scannerProfilesLiteral = {
	title: 'Scanner Profiles schema',
	version: 0,
	description: 'Local barcode-scanner profiles for direct/attributed input sources',
	type: 'object',
	primaryKey: 'deviceKey',
	properties: {
		deviceKey: {
			type: 'string',
			maxLength: 128,
			description:
				'Canonical device identity, composed by scannerDeviceKey() — "<connectionType>:<normalized identity>". The only value anything matches on.',
		},
		name: {
			type: 'string',
			description:
				'User-assigned name, e.g. "Front counter scanner". Falls back to deviceName in the UI when blank. Matches printer_profiles.name — same concept, same word.',
		},
		connectionType: {
			type: 'string',
			enum: ['keyboard', 'usb-serial', 'bluetooth-spp', 'bluetooth-le', 'hid-pos'],
			default: 'keyboard',
			description:
				'How this scanner is attached and spoken to. keyboard = device-identified HID keyboard, scans attributed by device rather than by typing speed (Android); usb-serial = Web Serial over USB-CDC; bluetooth-spp = Web Serial over Bluetooth RFCOMM; bluetooth-le = vendor GATT (iOS app mode, #1461); hid-pos = WebHID USB HID POS. Deliberately names the transport, because "USB" and "Bluetooth" are different things to a merchant — the old single "serial" value covered both and forced the UI to guess which by sniffing optional fields.',
		},
		deviceName: {
			type: 'string',
			description: 'The device name reported by the platform. Display only.',
		},
		vendorId: {
			type: 'integer',
			description: 'USB vendor id, where the platform reports one. Display only.',
		},
		productId: {
			type: 'integer',
			description: 'USB product id, where the platform reports one. Display only.',
		},
		serviceUuid: {
			type: 'string',
			description:
				'The Bluetooth service UUID this scanner speaks: the RFCOMM service class for bluetooth-spp, or the matched vendor GATT service for bluetooth-le. Normalized lowercase. Display only.',
		},
		peripheralId: {
			type: 'string',
			description:
				'For bluetooth-le: the platform peripheral identifier (iOS CBPeripheral identifier UUID — stable per device+phone). Display only; it reaches the key via scannerDeviceKey().',
		},
		createdAt: {
			type: 'string',
			description: 'ISO date the profile was registered',
		},
	},
	required: ['deviceKey', 'connectionType', 'deviceName'],
	indexes: [],
} as const;
