export const scannerProfilesLiteral = {
	title: 'Scanner Profiles schema',
	version: 1,
	description: 'Local barcode-scanner profiles for direct/attributed input sources',
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: {
			type: 'string',
			maxLength: 36,
		},
		label: {
			type: 'string',
			description: 'User-assigned name, e.g. "Front counter scanner"',
		},
		connectionType: {
			type: 'string',
			enum: ['wedge-attributed', 'serial', 'hid-pos'],
			default: 'wedge-attributed',
			description:
				'How this scanner connects: wedge-attributed = device-identified HID keyboard (Android); serial = Web Serial (USB-CDC / BT-SPP); hid-pos = WebHID USB HID POS',
		},
		deviceName: {
			type: 'string',
			description: 'The device name reported by the platform',
		},
		vendorId: {
			type: 'integer',
			description: 'USB/Bluetooth vendor id of the device',
		},
		productId: {
			type: 'integer',
			description: 'USB/Bluetooth product id of the device',
		},
		serialNumber: {
			type: 'string',
			description: 'USB serial number, when the platform exposes one (helps re-match on reconnect)',
		},
		hidUsagePage: {
			type: 'integer',
			description: 'For hid-pos: the HID usage page (0x8C for POS) used to re-open the device',
		},
		createdAt: {
			type: 'string',
			description: 'ISO date the profile was registered',
		},
	},
	required: ['id', 'connectionType', 'deviceName'],
	indexes: [],
} as const;
