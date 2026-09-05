const EPOS_PRINT_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';
const SOAP_NS = 'http://schemas.xmlsoap.org/soap/envelope/';

export function buildEposXml(innerXml: string): string {
	return [
		'<?xml version="1.0" encoding="utf-8"?>',
		`<s:Envelope xmlns:s="${SOAP_NS}">`,
		'<s:Body>',
		`<epos-print xmlns="${EPOS_PRINT_NS}">`,
		innerXml,
		'</epos-print>',
		'</s:Body>',
		'</s:Envelope>',
	].join('');
}

export function parseEposResponse(body: string): {
	success: boolean;
	code: string;
	status: string;
} {
	const response = body.match(/<(?:[A-Za-z_][\w.-]*:)?response\b[^>]*>/i)?.[0];
	if (!response) throw new Error('Unexpected Epson ePOS response from printer');
	const attribute = (name: string) =>
		response.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '';

	const success = attribute('success');
	return {
		success: success === 'true' || success === '1',
		code: attribute('code'),
		status: attribute('status'),
	};
}

export function commandFromBytes(bytes: Uint8Array): string {
	const parts: string[] = [];
	for (let i = 0; i < bytes.length; i++) {
		parts.push(bytes[i].toString(16).padStart(2, '0'));
	}
	return `<command>${parts.join('')}</command>`;
}
