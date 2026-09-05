import { describe, expect, it } from 'vitest';

import { buildEposXml, commandFromBytes, parseEposResponse } from '../epson-epos-protocol';

describe('Epson ePOS protocol', () => {
	it('encodes raw command bytes as firmware-compatible lowercase hex', () => {
		expect(commandFromBytes(new Uint8Array([0x1b, 0x40, 0x00, 0xff]))).toBe(
			'<command>1b4000ff</command>'
		);
	});

	it('builds the ePOS SOAP envelope around inner XML', () => {
		expect(buildEposXml('<command>1b40</command>')).toBe(
			'<?xml version="1.0" encoding="utf-8"?>' +
				'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
				'<s:Body>' +
				'<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">' +
				'<command>1b40</command>' +
				'</epos-print></s:Body></s:Envelope>'
		);
	});

	it('parses a successful namespaced epos-print response', () => {
		const result = parseEposResponse(
			'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" code="" status="251658262" />'
		);

		expect(result).toEqual({ success: true, code: '', status: '251658262' });
	});

	it('extracts the code from a failed epos-print response', () => {
		const result = parseEposResponse(
			'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="false" code="SchemaError" status="0" />'
		);

		expect(result).toEqual({ success: false, code: 'SchemaError', status: '0' });
	});

	it.each([
		[
			'<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><response success="true" code="" status="251658262" battery="0" xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print"></response></s:Body></s:Envelope>',
		],
		['<x:response code="" status="251658262" success="1" />'],
	])('parses response tags without a DOM', (body) => {
		expect(parseEposResponse(body)).toEqual({ success: true, code: '', status: '251658262' });
	});

	it('rejects bodies without a response element', () => {
		expect(() => parseEposResponse('garbage')).toThrow(
			'Unexpected Epson ePOS response from printer'
		);
	});
});
