/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { render, waitFor } from '@testing-library/react';
import { FormProvider, useForm } from 'react-hook-form';

import { FormErrors } from './form-errors';

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/notice', () => ({
	Notice: ({ title, children }: React.PropsWithChildren<{ title?: string }>) => (
		<div>
			{title}
			{children}
		</div>
	),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../jest/translate').createTestT(),
}));

function Harness({ labels }: { labels?: Record<string, string> }) {
	const form = useForm<{ code: string }>();
	React.useEffect(
		() => form.setError('code', { message: 'Enter a coupon code, or tap Generate.' }),
		[form]
	);
	return (
		<FormProvider {...form}>
			<FormErrors labels={labels} />
		</FormProvider>
	);
}

it.each([
	[{ code: 'Code' }, 'Code: Enter a coupon code, or tap Generate.'],
	[undefined, 'code: Enter a coupon code, or tap Generate.'],
])('FormErrors with labels %j reads %s', async (labels, text) => {
	const { container } = render(<Harness labels={labels} />);
	await waitFor(() => expect(container.textContent).toContain(text));
});
