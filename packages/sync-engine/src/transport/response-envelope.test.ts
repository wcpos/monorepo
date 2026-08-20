// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { hydrateResponse, type ResponseEnvelopeTransportState } from './response-envelope';

const enveloped = (wcpos: Record<string, unknown>, data: unknown = [{ id: 7 }]) =>
	new Response(JSON.stringify({ data, _wcpos: { v: 1, ...wcpos } }), {
		headers: { 'content-type': 'application/json' },
	});

describe('hydrateResponse', () => {
	it('keeps a readable, well-formed header', async () => {
		const response = enveloped({ total: 12 });
		response.headers.set('X-WP-Total', '9');

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
		});

		expect(hydrated.headers.get('X-WP-Total')).toBe('9');
		expect(await hydrated.json()).toEqual([{ id: 7 }]);
	});

	it('patches absent headers from the body envelope and records silent degradation once', async () => {
		const transportState: ResponseEnvelopeTransportState = {
			responseHeadersReadable: true,
		};
		const onDiagnostic = vi.fn();
		const options = {
			envelopeRequested: true,
			transportState,
			onDiagnostic,
		} as const;
		const hydrated = await hydrateResponse(
			enveloped({
				total: 12,
				total_pages: 2,
				pressure: 'elevated',
				server_load: [0.1, 0.2, 0.3],
				memory_peak_bytes: 2048,
				validator: 'W/"12:abc"',
			}),
			options
		);

		expect(Object.fromEntries(hydrated.headers.entries())).toMatchObject({
			'x-wp-total': '12',
			'x-wp-totalpages': '2',
			'x-wcpos-pressure': 'elevated',
			'x-server-load': '[0.1,0.2,0.3]',
			'x-wcpos-memory-peak': '2048',
			etag: 'W/"12:abc"',
		});
		expect(transportState.responseHeadersReadable).toBe(false);
		await hydrateResponse(enveloped({ total: 13 }), options);
		expect(onDiagnostic).toHaveBeenCalledTimes(1);
		expect(onDiagnostic).toHaveBeenCalledWith('unreadable');
	});

	it('uses the envelope when a header is malformed', async () => {
		const response = enveloped({ total: 12 });
		response.headers.set('X-WP-Total', '-1');

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
		});

		expect(hydrated.headers.get('X-WP-Total')).toBe('12');
	});

	it('leaves the header absent when both sources are absent', async () => {
		const hydrated = await hydrateResponse(enveloped({}), {
			envelopeRequested: true,
		});

		expect(hydrated.headers.get('X-WP-Total')).toBeNull();
	});

	it('keeps the header when it diverges from the envelope', async () => {
		const response = enveloped({ total_pages: 2 });
		response.headers.set('X-WP-TotalPages', '3');
		const onDiagnostic = vi.fn();

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
			onDiagnostic,
		});

		expect(hydrated.headers.get('X-WP-TotalPages')).toBe('3');
		expect(onDiagnostic).toHaveBeenCalledWith('divergent');
	});

	it('returns the raw response without parsing when no envelope was requested', async () => {
		const response = new Response('[{"id":7}]');
		const json = vi.spyOn(response, 'json');

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: false,
		});

		expect(hydrated).toBe(response);
		expect(json).not.toHaveBeenCalled();
		expect(await hydrated.text()).toBe('[{"id":7}]');
	});

	it('never rejects on a non-JSON body — text stays readable, json fails like fetch would', async () => {
		const response = new Response('<html>edge challenge page</html>', {
			status: 502,
		});

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
		});

		expect(hydrated.status).toBe(502);
		expect(await hydrated.text()).toBe('<html>edge challenge page</html>');
		await expect(hydrated.json()).rejects.toThrow();
	});

	it('tolerates a Headers-compatible stub whose get method throws', async () => {
		const response = enveloped({ total: 12 });
		Object.defineProperty(response, 'headers', {
			value: {
				get: () => {
					throw new Error('headers unavailable');
				},
			},
		});

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
		});

		expect(hydrated.headers.get('X-WP-Total')).toBe('12');
		expect(await hydrated.json()).toEqual([{ id: 7 }]);
	});
});
