/** @jest-environment jsdom */
import '@testing-library/jest-dom';
import * as React from 'react';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { DEFAULT_FORM_VALUES, electronPrinterSchema } from '../../schema';
import { ConnectionTypeSegmented } from './connection-type-segmented';

import type { PrinterFormValues } from '../../schema';
import type { Resolver } from 'react-hook-form';

jest.mock('react-native', () => ({
	Platform: { OS: 'web' },
}));

jest.mock('@wcpos/components/segmented-control', () => ({
	SegmentedControl: ({ segments, value, onValueChange, testID }: any) => (
		<div data-testid={testID} role="radiogroup">
			{segments.map((segment: any) => (
				<button
					key={segment.value}
					type="button"
					data-testid={segment.testID}
					role="radio"
					aria-checked={segment.value === value ? 'true' : 'false'}
					onClick={() => onValueChange(segment.value)}
				>
					{segment.label}
				</button>
			))}
		</div>
	),
}));

jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../../../../../../contexts/translations', () => ({
	useT: () =>
		jest
			.requireActual<typeof import('../../../../../../../jest/translate')>(
				'../../../../../../../jest/translate'
			)
			.createTestT(),
}));

describe('ConnectionTypeSegmented', () => {
	it('renders only the platform-supported connection types passed by the dialog', () => {
		render(
			<ConnectionTypeSegmented
				form={{ clearErrors: jest.fn() }}
				value="network"
				onChange={jest.fn()}
				availableTypes={['network', 'usb']}
			/>
		);

		expect(screen.getByTestId('add-printer-connection-type-network')).toBeInTheDocument();
		expect(screen.getByTestId('add-printer-connection-type-usb')).toBeInTheDocument();
		expect(screen.queryByTestId('add-printer-connection-type-bluetooth')).toBeNull();
		expect(screen.queryByTestId('add-printer-connection-type-cloud')).toBeNull();
	});

	it('draws no switch when only one connection type is supported', () => {
		render(
			<ConnectionTypeSegmented
				form={{ clearErrors: jest.fn() }}
				value="network"
				onChange={jest.fn()}
				availableTypes={['network']}
			/>
		);

		expect(screen.queryByTestId('add-printer-connection-type-segmented')).toBeNull();
	});

	it('emits stable connection-type values when selected', () => {
		const onChange = jest.fn();
		render(
			<ConnectionTypeSegmented
				form={{ clearErrors: jest.fn() }}
				value="network"
				onChange={onChange}
			/>
		);

		fireEvent.click(screen.getByTestId('add-printer-connection-type-usb'));

		expect(onChange).toHaveBeenCalledWith('usb');
	});
});

it.each(['bluetooth', 'usb'])(
	'clears address errors without validating on switch to %s',
	async (type) => {
		function Harness() {
			const form = useForm<PrinterFormValues>({
				defaultValues: DEFAULT_FORM_VALUES,
				resolver: zodResolver(electronPrinterSchema) as unknown as Resolver<PrinterFormValues>,
			});
			return (
				<>
					<button onClick={() => form.setError('address', { message: 'required' })}>
						Invalidate
					</button>
					<span data-testid="address-error">{form.formState.errors.address?.message}</span>
					<ConnectionTypeSegmented
						form={form}
						value={form.watch('connectionType') ?? 'network'}
						onChange={(v) => form.setValue('connectionType', v)}
					/>
				</>
			);
		}
		render(<Harness />);
		fireEvent.click(screen.getByTestId(`add-printer-connection-type-${type}`));
		await waitFor(() => expect(screen.getByTestId('address-error')).toBeEmptyDOMElement());
		fireEvent.click(screen.getByText('Invalidate'));
		expect(screen.getByTestId('address-error')).toHaveTextContent('required');
		fireEvent.click(screen.getByTestId(`add-printer-connection-type-${type}`));
		await waitFor(() => expect(screen.getByTestId('address-error')).toBeEmptyDOMElement());
	}
);
