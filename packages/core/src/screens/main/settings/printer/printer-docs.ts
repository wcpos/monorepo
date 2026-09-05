import { Linking } from 'react-native';

/** The printer setup and troubleshooting page; "Having trouble?" opens it until the in-app wizard ships. */
export const PRINTER_DOCS_URL = 'https://docs.wcpos.com/hardware/printers';

export function openPrinterDocs(): void {
	void Linking.openURL(PRINTER_DOCS_URL);
}
