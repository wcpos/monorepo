import { invalidParamContext } from './invalid-param-names';

describe('invalidParamContext', () => {
	it('reports sorted direct field names without their values', () => {
		const result = invalidParamContext({
			data: { status: 400, params: { billing: 'Invalid email', line_items: 'x' } },
		});
		expect(result).toEqual({ invalidParams: 'billing, line_items' });
		expect(JSON.stringify(result)).not.toContain('Invalid email');
	});

	it('finds field names through an error cause', () => {
		const error = Object.assign(new Error('preflight_failed'), {
			cause: Object.assign(new Error('write-rejected'), {
				data: { params: { meta_data: 'bad' } },
			}),
		});
		expect(invalidParamContext(error)).toEqual({ invalidParams: 'meta_data' });
	});

	it('reads axios-shaped errors', () => {
		const error = {
			response: { data: { code: 'rest_invalid_param', data: { params: { customer_id: 'bad' } } } },
		};
		expect(invalidParamContext(error)).toEqual({ invalidParams: 'customer_id' });
	});

	it.each([
		undefined,
		null,
		'text',
		new Error('x'),
		{ data: { params: [] } },
		{ data: { params: {} } },
	])('returns no context for %p', (error) => expect(invalidParamContext(error)).toEqual({}));

	it('stops on a self-referencing cause', () => {
		const error = Object.assign(new Error('a'), { cause: undefined as unknown });
		error.cause = error;
		expect(invalidParamContext(error)).toEqual({});
	});

	it('caps field names at 20', () => {
		const names = Array.from({ length: 25 }, (_, i) => `k${String(i).padStart(2, '0')}`);
		const params = Object.fromEntries(names.map((name) => [name, 'bad']));
		const result = invalidParamContext({ data: { params } });
		expect(result.invalidParams?.split(', ')).toEqual(names.slice(0, 20));
	});
});
