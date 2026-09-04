import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EpsonEposAdapter } from '../epson-epos-adapter';

const successResponse =
	'<response xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print" success="true" />';

describe('web EpsonEposAdapter', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(successResponse, { status: 200 }))
		);
	});

	afterEach(() => vi.unstubAllGlobals());

	it('posts structured XML for markup and keeps command pass-through for raw bytes', async () => {
		const adapter = new EpsonEposAdapter('printer.test', 443);
		const job = {
			template: '<receipt><text>Hello</text></receipt>',
			data: {},
			options: {},
		};

		expect(await adapter.supportsMarkup()).toBe(true);
		await adapter.printMarkup(job);
		const markupBody = String(vi.mocked(fetch).mock.calls[0]?.[1]?.body);
		expect(markupBody).toContain('<text ');
		expect(markupBody).not.toContain('<command>');

		await adapter.printRaw(new Uint8Array([0x1b, 0x40]));
		expect(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body)).toContain('<command>1b40</command>');
	});

	it('surfaces a structured-job rejection code', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			new Response(successResponse.replace('success="true"', 'success="false" code="SchemaError"'))
		);

		await expect(
			new EpsonEposAdapter('printer.test', 443).printMarkup({
				template: '<receipt><text>Hello</text></receipt>',
				data: {},
				options: {},
			})
		).rejects.toThrow('SchemaError');
	});
});
