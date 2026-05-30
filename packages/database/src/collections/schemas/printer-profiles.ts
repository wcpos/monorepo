export const printerProfilesLiteral = {
	title: 'Printer Profiles schema',
	version: 7,
	description: 'Local printer profiles for direct thermal printing',
	type: 'object',
	primaryKey: 'id',
	properties: {
		id: {
			type: 'string',
			maxLength: 36,
		},
		name: {
			type: 'string',
			description: 'User-assigned name, e.g. "Receipt Printer"',
		},
		connectionType: {
			type: 'string',
			enum: ['network', 'bluetooth', 'usb', 'system', 'cloud'],
			default: 'network',
		},
		vendor: {
			type: 'string',
			enum: ['epson', 'star', 'generic'],
			default: 'generic',
		},
		address: {
			type: 'string',
			description: 'IP address, BLE address, or USB path',
		},
		port: {
			type: 'integer',
			default: 9100,
		},
		nativeInterfaceType: {
			type: 'string',
			description: 'Vendor-native interface type hint, eg Star BluetoothLE vs Bluetooth',
		},
		cloudPrinterId: {
			type: 'string',
			minLength: 1,
			maxLength: 64,
			description:
				'For connectionType "cloud": the WCPOS plugin-side registered cloud printer ID this profile prints to.',
		},
		cloudProvider: {
			type: 'string',
			enum: ['star-cloudprnt', 'epson-sdp', 'printnode'],
			description:
				'For connectionType "cloud": the server-side print provider backing the registered cloud printer. Drives job delivery format (raw payload for Star CloudPRNT vs server-rendered order-based jobs for Epson SDP / PrintNode).',
		},
		printerModel: {
			type: 'string',
			description: 'receipt-printer-encoder model key, e.g. "epson-tm-t88vi"',
		},
		language: {
			type: 'string',
			enum: ['esc-pos', 'star-prnt', 'star-line'],
			default: 'esc-pos',
		},
		columns: {
			type: 'integer',
			default: 42,
			description:
				'Printer character capacity: 32 for 58mm, 42 for standard 80mm, 48 for wide/known 48-CPL 80mm',
		},
		emitEscPrintMode: {
			type: 'boolean',
			default: true,
			description:
				'Emit ESC ! print-mode bytes alongside GS ! size bytes for broader printer compatibility. Disable as an escape hatch when a printer misbehaves.',
		},
		autoCut: {
			type: 'boolean',
			default: true,
		},
		autoOpenDrawer: {
			type: 'boolean',
			default: false,
		},
		fullReceiptRaster: {
			type: 'boolean',
			default: false,
			description:
				'Print the whole receipt as a raster image for Unicode/RTL compatibility. Slower and larger than text mode.',
		},
		isDefault: {
			type: 'boolean',
			default: false,
		},
		isBuiltIn: {
			type: 'boolean',
			default: false,
			description: 'True for platform-provided printers that cannot be deleted',
		},
	},
	required: ['id', 'name', 'connectionType'],
} as const;
