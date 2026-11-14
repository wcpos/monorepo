import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { Derivation, DerivationLine, DerivationStep } from './index';

jest.mock('../loader', () => ({ Loader: () => null }));

// Expose classes because Jest does not compile Uniwind.
jest.mock('react-native', () => {
	const actual = jest.requireActual('react-native');
	return {
		...actual,
		View: ({ testID, className, ...props }: { testID?: string; className?: string }) =>
			React.createElement('div', { ...props, 'data-testid': testID, 'data-classes': className }),
		Text: ({ className, children }: { className?: string; children?: React.ReactNode }) =>
			React.createElement('span', { 'data-classes': className }, children),
	};
});
jest.mock('../table', () => ({
	TABLE_HEAD_TEXT: 'text-muted-foreground text-xs font-medium tracking-wide uppercase',
}));
jest.mock('../icon', () => ({
	Icon: ({ name, className }: { name: string; className?: string }) => (
		<i data-testid={`icon-${name}`} data-classes={className} />
	),
}));

const classes = (element: Element) => (element as HTMLElement).dataset.classes ?? '';
const beads = () => screen.getAllByTestId('derivation-bead').map(classes);
const rails = () => screen.getAllByTestId('derivation-rail').map(classes);

it('draws a muted disc for a fact and a foreground disc for the result, one rail between each', () => {
	render(
		<Derivation>
			<DerivationStep label="Calculated from" title="Shop base address" />
			<DerivationStep label="Shop address" title="United Kingdom (UK)" />
			<DerivationStep state="result" label="Rates that match it" />
		</Derivation>
	);
	expect(beads()).toEqual([
		expect.stringContaining('bg-muted-foreground'),
		expect.stringContaining('bg-muted-foreground'),
		expect.stringContaining('bg-foreground'),
	]);
	expect(beads().every((bead) => bead.includes('size-4') && bead.includes('rounded-full'))).toBe(
		true
	);
	// Two rails for three beads: the last step closes the chain.
	expect(rails()).toHaveLength(2);
	expect(rails().every((rail) => rail.includes('bg-border') && rail.includes('w-0.5'))).toBe(true);
	expect(rails().some((rail) => rail.includes('opacity-50'))).toBe(false);
	expect(screen.getAllByRole('listitem')).toHaveLength(3);
});

it('closes a failed step red with a cross, and quiets the rail and the step after it', () => {
	render(
		<Derivation>
			<DerivationStep label="Calculated from" title="Customer billing address" />
			<DerivationStep
				state="failed"
				label="No address on the order"
				title="This order has no billing address, so no rate can match"
				detail="Add a customer with an address, or change the setting"
			/>
			<DerivationStep state="quiet" label="Rates that match it" detail="None" />
		</Derivation>
	);
	const [, failed, quiet] = beads();
	expect(failed).toContain('bg-bad');
	expect(classes(screen.getByTestId('icon-close'))).toContain('text-card');
	expect(classes(screen.getByTestId('icon-close'))).toContain('size-2.5');
	expect(quiet).toContain('border-2');
	expect(quiet).not.toContain('bg-');
	expect(rails()[0]).not.toContain('opacity-50');
	expect(rails()[1]).toContain('opacity-50');
	expect(classes(screen.getByText('No address on the order'))).toContain('text-bad');
	expect(classes(screen.getByText('None'))).toContain('text-muted-foreground');
});

it('sets the label in the head recipe, the title semibold, the detail muted, and trailing beside the title', () => {
	render(
		<Derivation>
			<DerivationStep
				label="Rates that match it"
				title="Standard rate"
				detail="Add one in WooCommerce › Tax"
				trailing={<span>22%</span>}
			/>
		</Derivation>
	);
	expect(classes(screen.getByText('Rates that match it'))).toContain('uppercase');
	expect(classes(screen.getByText('Standard rate'))).toContain('font-semibold');
	expect(classes(screen.getByText('Add one in WooCommerce › Tax'))).toContain('text-sm');
	expect(screen.getByText('22%')).toBeTruthy();
	expect(screen.queryByTestId('derivation-rail')).toBeNull();
});

it('a sub-line carries its reason, amount and action, and reads bad when refused', () => {
	const onPress = jest.fn();
	render(
		<Derivation>
			<DerivationStep label="Paid out · 2" title="Paid out">
				<DerivationLine
					label="Window cleaner"
					amount="−20,00 £"
					action={{ label: 'Void', testID: 'void-1', onPress }}
				/>
				<DerivationLine
					label="Petty cash"
					note="Refused"
					amount="−5,00 £"
					tone="bad"
					testID="line-2"
				/>
			</DerivationStep>
		</Derivation>
	);
	expect(screen.getByText('Window cleaner')).toBeTruthy();
	expect(screen.getByText('−20,00 £')).toBeTruthy();
	fireEvent.click(screen.getByTestId('void-1'));
	expect(onPress).toHaveBeenCalledTimes(1);
	expect(screen.getByText('Refused')).toBeTruthy();
	expect(classes(screen.getByText('Petty cash'))).toContain('text-bad');
});

it('a blind sub-line omits money and a disabled Void cannot act', () => {
	const onPress = jest.fn();
	render(
		<DerivationLine
			label="Change"
			action={{ label: 'Void', testID: 'void', onPress, disabled: true }}
		/>
	);
	fireEvent.click(screen.getByTestId('void'));
	expect(onPress).not.toHaveBeenCalled();
	expect(screen.queryByText(/£/)).toBeNull();
});
