import { Action, ACTIONS, CalculatorState, reducer } from './reducer';

const defaultState: CalculatorState = {
	currentOperand: null,
	operation: null,
	previousOperand: null,
};

/** Helper to build a full CalculatorState from partial properties */
const state = (partial: Partial<CalculatorState>): CalculatorState => ({
	...defaultState,
	...partial,
});

describe('reducer', () => {
	it('adds digit', () => {
		const s = state({ currentOperand: '1' });
		const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '2' } };
		const newState = reducer(s, action);
		expect(newState).toEqual(state({ currentOperand: '12' }));
	});

	it('chooses operation', () => {
		const s = state({ currentOperand: '1', previousOperand: null, operation: null });
		const action: Action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '+' } };
		const newState = reducer(s, action);
		expect(newState).toEqual(
			state({
				previousOperand: '1',
				operation: '+',
				currentOperand: null,
			})
		);
	});

	it('clears state', () => {
		const s = state({ currentOperand: '1', previousOperand: '2' });
		const action: Action = { type: ACTIONS.CLEAR };
		const newState = reducer(s, action);
		expect(newState).toEqual({
			overwrite: false,
			currentOperand: null,
			previousOperand: null,
			operation: null,
		});
	});

	it('deletes digit', () => {
		const s = state({ currentOperand: '12' });
		const action: Action = { type: ACTIONS.DELETE_DIGIT };
		const newState = reducer(s, action);
		expect(newState).toEqual(state({ currentOperand: '1' }));
	});

	it('add numbers', () => {
		const s = state({
			currentOperand: '2',
			previousOperand: '1',
			operation: '+',
		});
		const action: Action = { type: ACTIONS.EVALUATE };
		const newState = reducer(s, action);
		expect(newState).toEqual(
			state({
				overwrite: true,
				currentOperand: '3',
				previousOperand: null,
				operation: null,
			})
		);
	});

	it('subtracts numbers', () => {
		const s = state({
			currentOperand: '2',
			previousOperand: '1',
			operation: '-',
		});
		const action: Action = { type: ACTIONS.EVALUATE };
		const newState = reducer(s, action);
		expect(newState).toEqual(
			state({
				overwrite: true,
				currentOperand: '-1',
				previousOperand: null,
				operation: null,
			})
		);
	});

	it('multiplies numbers (with rounding)', () => {
		const s = state({
			currentOperand: '3',
			previousOperand: '3.333333333',
			operation: '*',
		});
		const action: Action = { type: ACTIONS.EVALUATE };
		const newState = reducer(s, action);
		expect(newState).toEqual(
			state({
				overwrite: true,
				currentOperand: '10',
				previousOperand: null,
				operation: null,
			})
		);
	});

	it('should switch the sign of the current operand', () => {
		let s = state({ currentOperand: '123' });
		s = reducer(s, { type: ACTIONS.SWITCH_SIGN });
		expect(s).toEqual(state({ currentOperand: '-123' }));

		s = reducer(s, { type: ACTIONS.SWITCH_SIGN });
		expect(s).toEqual(state({ currentOperand: '123' }));
	});

	describe('quick discount functionality', () => {
		it('applies a 5% discount', () => {
			let s = state({ currentOperand: '100' });
			s = reducer(s, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(s).toEqual(state({ currentOperand: '95', overwrite: true })); // 5% off 100 is 95
		});

		it('applies another 5% discount', () => {
			let s = state({ currentOperand: '95' });
			s = reducer(s, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(s).toEqual(state({ currentOperand: (95 * 0.95).toString(), overwrite: true })); // 5% off 95
		});

		it('applies a third 5% discount', () => {
			let s = state({ currentOperand: (95 * 0.95).toString() });
			s = reducer(s, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(s).toEqual(state({ currentOperand: (95 * 0.95 * 0.95).toString(), overwrite: true })); // 5% off the previous result
		});

		it('applies a -10% discount resulting in 110%', () => {
			let s = state({ currentOperand: '100' });
			s = reducer(s, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: -10 } });
			expect(s).toEqual(state({ currentOperand: '110', overwrite: true })); // 110% of 100 is 110
		});
	});

	it('Fixes this bug:', () => {
		let s = state({ currentOperand: '0.' });
		s = reducer(s, { type: ACTIONS.DELETE_DIGIT });
		s = reducer(s, { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } });
		expect(s).toEqual(state({ currentOperand: '0.' }));
	});

	describe('division', () => {
		it('divides numbers', () => {
			const s = state({
				currentOperand: '2',
				previousOperand: '10',
				operation: '÷',
			});
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('5');
		});

		it('handles division with decimals', () => {
			const s = state({
				currentOperand: '3',
				previousOperand: '10',
				operation: '÷',
			});
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('3.333333');
		});
	});

	describe('ADD_DIGIT edge cases', () => {
		it('prevents multiple zeros at start', () => {
			const s = state({ currentOperand: '0' });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '0' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('0');
		});

		it('prevents multiple decimal points', () => {
			const s = state({ currentOperand: '1.5' });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('1.5');
		});

		it('adds 0. when decimal is first input', () => {
			const s = state({ currentOperand: null });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('0.');
		});

		it('replaces 0 with digit', () => {
			const s = state({ currentOperand: '0' });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('5');
		});

		it('handles overwrite mode', () => {
			const s = state({ currentOperand: '100', overwrite: true });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('5');
			expect(newState.overwrite).toBe(false);
		});

		it('handles overwrite mode with decimal', () => {
			const s = state({ currentOperand: '100', overwrite: true });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('0.');
		});

		it('handles payload.overwrite flag', () => {
			const s = state({ currentOperand: '100' });
			const action: Action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5', overwrite: true } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('5');
		});
	});

	describe('CHOOSE_OPERATION edge cases', () => {
		it('does nothing when both operands are null', () => {
			const s = state({ currentOperand: null, previousOperand: null, operation: null });
			const action: Action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '+' } };
			const newState = reducer(s, action);
			expect(newState).toEqual(s);
		});

		it('changes operation when only previousOperand exists', () => {
			const s = state({ currentOperand: null, previousOperand: '5', operation: '+' });
			const action: Action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '-' } };
			const newState = reducer(s, action);
			expect(newState.operation).toBe('-');
		});

		it('evaluates and chains operations', () => {
			const s = state({ currentOperand: '3', previousOperand: '5', operation: '+' });
			const action: Action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '*' } };
			const newState = reducer(s, action);
			expect(newState.previousOperand).toBe('8');
			expect(newState.operation).toBe('*');
			expect(newState.currentOperand).toBeNull();
		});
	});

	describe('DELETE_DIGIT edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const s = state({ currentOperand: null });
			const action: Action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('sets to null when deleting last digit', () => {
			const s = state({ currentOperand: '5' });
			const action: Action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('sets to null when deleting negative single digit', () => {
			const s = state({ currentOperand: '-5' });
			const action: Action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('removes decimal and preceding digit', () => {
			const s = state({ currentOperand: '12.' });
			const action: Action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('1');
		});

		it('handles overwrite mode', () => {
			const s = state({ currentOperand: '100', overwrite: true });
			const action: Action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
			expect(newState.overwrite).toBe(false);
		});
	});

	describe('EVALUATE edge cases', () => {
		it('does nothing when operation is null', () => {
			const s = state({ currentOperand: '5', previousOperand: '3', operation: null });
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action);
			expect(newState).toEqual(s);
		});

		it('does nothing when currentOperand is null', () => {
			const s = state({ currentOperand: null, previousOperand: '3', operation: '+' });
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action);
			expect(newState).toEqual(s);
		});

		it('does nothing when previousOperand is null', () => {
			const s = state({ currentOperand: '5', previousOperand: null, operation: '+' });
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action);
			expect(newState).toEqual(s);
		});
	});

	describe('SWITCH_SIGN edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const s = state({ currentOperand: null });
			const action: Action = { type: ACTIONS.SWITCH_SIGN };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('does nothing when currentOperand is 0', () => {
			const s = state({ currentOperand: '0' });
			const action: Action = { type: ACTIONS.SWITCH_SIGN };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('0');
		});
	});

	describe('APPLY_DISCOUNT edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const s = state({ currentOperand: null });
			const action: Action = { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 10 } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('handles 100% discount', () => {
			const s = state({ currentOperand: '100' });
			const action: Action = { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 100 } };
			const newState = reducer(s, action);
			expect(newState.currentOperand).toBe('0');
		});
	});

	describe('unknown action', () => {
		it('returns state unchanged for unknown action', () => {
			const s = state({ currentOperand: '5' });
			const action = { type: 'UNKNOWN_ACTION' } as unknown as Action;
			const newState = reducer(s, action);
			expect(newState).toEqual(s);
		});
	});

	describe('custom precision', () => {
		it('uses custom precision from config', () => {
			const s = state({
				currentOperand: '3',
				previousOperand: '10',
				operation: '÷',
			});
			const action: Action = { type: ACTIONS.EVALUATE };
			const newState = reducer(s, action, { precision: 2 });
			expect(newState.currentOperand).toBe('3.33');
		});
	});
});
