/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';

import { useFieldPresence } from './use-field-presence';

const FIELDS = [
	{ name: 'email', asked: true },
	{ name: 'company' },
	{ name: 'billing' },
	{ name: 'shipping' },
] as const;
type Name = (typeof FIELDS)[number]['name'];

function setup(initial: Partial<Record<Name, string>>) {
	const values = { ...initial };
	const onClear = jest.fn((name: Name) => {
		values[name] = '';
	});
	const hook = renderHook(() => useFieldPresence(FIELDS, (name) => !values[name], onClear));
	return { hook, values, onClear };
}

it('an asked field is present empty; a field with a value is present; the rest are offered', () => {
	const { hook } = setup({ billing: '12 High Street' });
	expect(hook.result.current.present).toEqual(['email', 'billing']);
	expect(hook.result.current.offered).toEqual(['company', 'shipping']);
});

it('an added field lands in its canonical place, not at the end, and stays once emptied', () => {
	const { hook } = setup({ shipping: 'Unit 4' });
	act(() => hook.result.current.add('company'));
	expect(hook.result.current.present).toEqual(['email', 'company', 'shipping']);
	expect(hook.result.current.offered).toEqual(['billing']);
	hook.rerender();
	expect(hook.result.current.present).toContain('company');
});

it('a field emptied after holding a value stays until its Remove, which clears it', () => {
	const { hook, values, onClear } = setup({ company: 'Acme' });
	values.company = '';
	hook.rerender();
	expect(hook.result.current.present).toContain('company');
	act(() => hook.result.current.withdraw('company'));
	expect(onClear).toHaveBeenCalledWith('company');
	expect(hook.result.current.offered).toEqual(['company', 'billing', 'shipping']);
});

it('a value that arrives later is present and kept', () => {
	const { hook, values } = setup({});
	values.billing = 'Leeds';
	hook.rerender();
	expect(hook.result.current.present).toEqual(['email', 'billing']);
	values.billing = '';
	hook.rerender();
	expect(hook.result.current.present).toEqual(['email', 'billing']);
});
