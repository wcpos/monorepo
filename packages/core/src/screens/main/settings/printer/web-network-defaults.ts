import type { VendorDefaults } from './dialog/use-printer-dialog-form';
import type { PrinterFormValues } from './schema';

type OriginProtocol = 'http:' | 'https:';

function getOriginProtocol(): OriginProtocol {
	return typeof window !== 'undefined' && window.location.protocol === 'https:'
		? 'https:'
		: 'http:';
}

export function deriveWebVendorDefaults(
	vendor: PrinterFormValues['vendor'],
	protocol: OriginProtocol = getOriginProtocol()
): VendorDefaults {
	const secure = protocol === 'https:';
	if (vendor === 'star') return { language: 'star-line', port: secure ? 443 : 80 };
	// Epson: 8043 on a secure origin, 8008 otherwise. 9100 is the "use default" sentinel.
	return { language: 'esc-pos', port: secure ? 8043 : 8008 };
}

export function deriveEndpointHint(
	vendor: PrinterFormValues['vendor'],
	address: string,
	port: number,
	protocol: OriginProtocol = getOriginProtocol()
): string | undefined {
	const ip = address.trim();
	if (!ip) return undefined;
	const secure = protocol === 'https:';
	if (vendor === 'epson') {
		const resolvedPort = port === 9100 ? (secure ? 8043 : 8008) : port;
		const protocol = resolvedPort === 8043 || resolvedPort === 443 ? 'https' : 'http';
		return `${protocol}://${ip}:${resolvedPort}/cgi-bin/epos/service.cgi`;
	}
	if (vendor === 'star') {
		const resolvedPort = port === 9100 ? (secure ? 443 : 80) : port;
		const protocol = secure ? 'https' : 'http';
		return `${protocol}://${ip}:${resolvedPort}/StarWebPRNT/SendMessage`;
	}
	return undefined;
}
