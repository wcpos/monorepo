/** Serializable device descriptor emitted by the connectors' `connected` event. */
export interface PosConnectedDevice {
	type: 'usb' | 'bluetooth';
	language: 'esc-pos' | 'star-prnt';
	codepageMapping?: string;
	vendorId?: number;
	productId?: number;
	manufacturerName?: string;
	productName?: string;
	serialNumber?: string;
	name?: string;
	id?: string;
}
