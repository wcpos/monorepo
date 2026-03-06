export const printerProfilesLiteral = {
  title: 'Printer Profiles schema',
  version: 0,
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
      enum: ['network', 'bluetooth', 'usb', 'system'],
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
      default: 48,
      description: '48 for 80mm paper, 32 for 58mm',
    },
    autoPrint: {
      type: 'boolean',
      default: false,
      description: 'Print automatically on checkout',
    },
    autoCut: {
      type: 'boolean',
      default: true,
    },
    autoOpenDrawer: {
      type: 'boolean',
      default: false,
    },
    isDefault: {
      type: 'boolean',
      default: false,
    },
  },
  required: ['id', 'name', 'connectionType'],
} as const;
