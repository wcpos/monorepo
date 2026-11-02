import type { DeclaredFields } from '@wcpos/order-math';

import {
	declaredValues,
	destinationOf,
	firstMissingRequired,
	prefillValues,
} from './declared-fields';

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

describe('destinationOf', () => {
	it('is the first declared email or tel field, as the store reads it, never a text field', () => {
		expect(destinationOf(fields, { email: ' a@b.c ', phone: '555' })).toBe('a@b.c');
		expect(destinationOf(fields, { email: '', phone: '555' })).toBeNull();
		const textFirst: DeclaredFields = {
			...fields,
			components: [
				{
					component: 'field',
					id: 'ref',
					input: 'text',
					label: 'Ref',
					required: false,
					default: '',
					prefill: null,
				},
				{
					component: 'field',
					id: 'tel',
					input: 'tel',
					label: 'Tel',
					required: false,
					default: '',
					prefill: null,
				},
			],
		};
		expect(destinationOf(textFirst, { ref: 'PO-1', tel: '555' })).toBe('555');
	});
});

describe('declaredValues', () => {
	it('posts only declared ids, coercing the checkbox to a boolean', () => {
		expect(
			declaredValues(fields, { email: 'a@b.c', when: 'now', save: undefined as never, stale: 'x' })
		).toEqual({ email: 'a@b.c', when: 'now', save: false });
	});
});
