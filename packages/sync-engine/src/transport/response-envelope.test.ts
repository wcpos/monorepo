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

	// expo's Android fetch (57.0.14, NativeResponse.onResponse) marks the body
	// COMPLETE after a cancel, so text() resolves with whatever had arrived —
	// usually nothing — instead of rejecting. A search superseded after its
	// headers then failed JSON.parse ("Unexpected end of input") and was logged
	// as SYNC321, never recognised as the cancellation it was.
	it('reports a body cut short by our own abort as the abort, not a parse error', async () => {
		const controller = new AbortController();
		const reason = new DOMException('Requirement released during drain', 'AbortError');
		controller.abort(reason);
		const response = new Response('', { status: 200 });

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
			signal: controller.signal,
		});

		expect(hydrated.status).toBe(200);
		await expect(hydrated.json()).rejects.toBe(reason);
	});

	it('names an abort without a reason as an AbortError (React Native drops abort reasons)', async () => {
		// RN's abort-controller polyfill ignores reasons, so on device the signal is
		// aborted with `reason` undefined — the branch that builds the AbortError.
		const signal = { aborted: true, reason: undefined } as unknown as AbortSignal;
		const response = new Response('[{"id":', { status: 200 });

		const hydrated = await hydrateResponse(response, { envelopeRequested: true, signal });

		const failure = await hydrated.json().catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(Error);
		expect(failure).toMatchObject({ name: 'AbortError' });
	});

	it('keeps a parse failure a parse failure when nothing aborted the request', async () => {
		const controller = new AbortController();
		const response = new Response('', { status: 200 });

		const hydrated = await hydrateResponse(response, {
			envelopeRequested: true,
			signal: controller.signal,
		});

		await expect(hydrated.json()).rejects.toBeInstanceOf(SyntaxError);
	});

	it('serves a complete body even when the signal aborted after it arrived', async () => {
		const controller = new AbortController();
		controller.abort();
		const hydrated = await hydrateResponse(enveloped({ total: 1 }), {
			envelopeRequested: true,
			signal: controller.signal,
		});

		expect(await hydrated.json()).toEqual([{ id: 7 }]);
	});

	it('drops a malformed validator instead of rejecting the response', async () => {
		const response = enveloped({ total: 12, validator: 'bad\nvalidator' });

		const hydrated = await hydrateResponse(response, { envelopeRequested: true });

		expect(hydrated.headers.get('X-WP-Total')).toBe('12');
		expect(hydrated.headers.get('ETag')).toBeNull();
		expect(await hydrated.json()).toEqual([{ id: 7 }]);
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
