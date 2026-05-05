import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { createScenarioState, SCENARIO_CHIPS } from '../../scenario-controls';
import { createRandomReceipt } from '../../randomizer';
import { DataSection } from './DataSection';

describe('DataSection scenario chips', () => {
	function renderSection(onToggleScenario = vi.fn()) {
		const receipt = createRandomReceipt({ seed: 'data-section', overrides: { hasFees: true } });
		const scenarioState = {
			...createScenarioState(receipt.scenarios, receipt.data),
			hasFees: true,
		};
		render(
			<DataSection
				seedLabel="abcd"
				onShuffle={vi.fn()}
				scenarioState={scenarioState}
				onToggleScenario={onToggleScenario}
				data={receipt.data as unknown as Record<string, unknown>}
				pristine={receipt.data as unknown as Record<string, unknown>}
				onChangePath={vi.fn()}
				onAddItem={vi.fn()}
				onRemoveItem={vi.fn()}
				onRevertSection={vi.fn()}
			/>
		);
		return { onToggleScenario };
	}

	it('renders every scenario chip as a toggle button', () => {
		renderSection();

		for (const chip of SCENARIO_CHIPS) {
			const button = screen.getByTestId(`scenario-chip-${chip.key}`);
			expect(screen.getByRole('button', { name: chip.label })).toBe(button);
			expect(button).toHaveAttribute('aria-pressed');
		}
		expect(screen.getByTestId('scenario-chip-hasFees')).toHaveAttribute('aria-pressed', 'true');
	});

	it('emits the clicked scenario key and next state', () => {
		const onToggleScenario = vi.fn();
		renderSection(onToggleScenario);

		fireEvent.click(screen.getByTestId('scenario-chip-hasFees'));

		expect(onToggleScenario).toHaveBeenCalledWith('hasFees', false);
	});
});
