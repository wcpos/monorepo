export const scannerProfilesLiteral = {
	title: 'Scanner Profiles schema',
	version: 0,
	description: 'Local barcode-scanner profiles for attributed input sources',
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
			enum: ['wedge-attributed'],
			default: 'wedge-attributed',
			description: 'How this scanner connects; wedge-attributed = device-identified HID keyboard',
		},
		deviceName: {
			type: 'string',
			description: 'The InputDevice name reported by the platform',
		},
		vendorId: {
			type: 'integer',
			description: 'USB/Bluetooth vendor id of the device',
		},
		productId: {
			type: 'integer',
			description: 'USB/Bluetooth product id of the device',
		},
		createdAt: {
			type: 'string',
			description: 'ISO date the profile was registered',
		},
	},
	required: ['id', 'connectionType', 'deviceName'],
	indexes: [],
} as const;
