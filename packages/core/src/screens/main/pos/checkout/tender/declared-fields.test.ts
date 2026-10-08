import type { DeclaredFields } from '@wcpos/order-math';

import { declaredValues, firstMissingRequired, prefillValues } from './declared-fields';

const fields: DeclaredFields = {
	schema: 1,
	verb: { kind: 'send', label: 'Send invoice' },
	components: [
		{ component: 'note', text: 'An email will be sent.' },
		{
			component: 'field',
			id: 'email',
			input: 'email',
			label: 'Email address',
			required: true,
			default: '',
			prefill: 'order.billing.email',
		},
		{
			component: 'field',
			id: 'phone',
			input: 'tel',
			label: 'Phone',
			required: false,
			default: '000',
			prefill: 'customer.phone',
		},
		{ component: 'checkbox', id: 'save', label: 'Save', default: true, prefill: null },
		{
			component: 'select',
			id: 'when',
			label: 'When',
			required: true,
			default: 'now',
			options: [
				{ value: 'now', label: 'Now' },
				{ value: 'later', label: 'Later' },
			],
		},
		{ component: 'hologram', id: 'h', label: 'Future' },
	],
};

describe('prefillValues', () => {
	it('fills from the named source when it is non-empty, else the default', () => {
		expect(prefillValues(fields, { billingEmail: 'a@b.c', customerPhone: '  ' })).toEqual({
			email: 'a@b.c',
			phone: '000',
			save: true,
			when: 'now',
		});
	});
	it('ignores an unknown prefill key and a component this build does not know', () => {
		const odd: DeclaredFields = {
			...fields,
			components: [
				{
					component: 'field',
					id: 'ref',
					input: 'text',
					label: 'Ref',
					required: false,
					default: 'x',
					prefill: 'order.customer_note',
				},
			],
		};
		expect(prefillValues(odd, { billingEmail: 'a@b.c' })).toEqual({ ref: 'x' });
	});
});

describe('firstMissingRequired', () => {
	it('names the first required field or select without a value, never a checkbox', () => {
		expect(firstMissingRequired(fields, { email: ' ', when: 'now' })?.id).toBe('email');
		expect(firstMissingRequired(fields, { email: 'a@b.c', when: '' })?.id).toBe('when');
		expect(firstMissingRequired(fields, { email: 'a@b.c', when: 'later' })).toBeNull();
	});
});

describe('declaredValues', () => {
	it('posts only declared ids, coercing the checkbox to a boolean', () => {
		expect(
			declaredValues(fields, { email: 'a@b.c', when: 'now', save: undefined as never, stale: 'x' })
		).toEqual({ email: 'a@b.c', when: 'now', save: false });
	});
});
