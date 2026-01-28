import { ACTIONS, reducer } from './reducer';

describe('reducer', () => {
	it('adds digit', () => {
		const state = { currentOperand: '1' };
		const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '2' } };
		const newState = reducer(state, action);
		expect(newState).toEqual({ currentOperand: '12' });
	});

	it('chooses operation', () => {
		const state = { currentOperand: '1', previousOperand: null, operation: null };
		const action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '+' } };
		const newState = reducer(state, action);
		expect(newState).toEqual({
			previousOperand: '1',
			operation: '+',
			currentOperand: null,
		});
	});

	it('clears state', () => {
		const state = { currentOperand: '1', previousOperand: '2' };
		const action = { type: ACTIONS.CLEAR };
		const newState = reducer(state, action);
		expect(newState).toEqual({
			overwrite: false,
			currentOperand: null,
			previousOperand: null,
			operation: null,
		});
	});

	it('deletes digit', () => {
		const state = { currentOperand: '12' };
		const action = { type: ACTIONS.DELETE_DIGIT };
		const newState = reducer(state, action);
		expect(newState).toEqual({ currentOperand: '1' });
	});

	it('add numbers', () => {
		const state = {
			currentOperand: '2',
			previousOperand: '1',
			operation: '+',
		};
		const action = { type: ACTIONS.EVALUATE, payload: { decimalSeparator: '.' } };
		const newState = reducer(state, action);
		expect(newState).toEqual({
			overwrite: true,
			currentOperand: '3',
			previousOperand: null,
			operation: null,
		});
	});

	it('subtracts numbers', () => {
		const state = {
			currentOperand: '2',
			previousOperand: '1',
			operation: '-',
		};
		const action = { type: ACTIONS.EVALUATE, payload: { decimalSeparator: '.' } };
		const newState = reducer(state, action);
		expect(newState).toEqual({
			overwrite: true,
			currentOperand: '-1',
			previousOperand: null,
			operation: null,
		});
	});

	it('multiplies numbers (with rounding)', () => {
		const state = {
			currentOperand: '3',
			previousOperand: '3.333333333',
			operation: '*',
		};
		const action = { type: ACTIONS.EVALUATE, payload: { decimalSeparator: '.' } };
		const newState = reducer(state, action);
		expect(newState).toEqual({
			overwrite: true,
			currentOperand: '10',
			previousOperand: null,
			operation: null,
		});
	});

	it('should switch the sign of the current operand', () => {
		let state = { currentOperand: '123' };
		state = reducer(state, { type: ACTIONS.SWITCH_SIGN, payload: { operation: '+/-' } });
		expect(state).toEqual({ currentOperand: '-123' });

		state = reducer(state, { type: ACTIONS.SWITCH_SIGN, payload: { operation: '+/-' } });
		expect(state).toEqual({ currentOperand: '123' });
	});

	describe('quick discount functionality', () => {
		it('applies a 5% discount', () => {
			let state = { currentOperand: '100' };
			state = reducer(state, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(state).toEqual({ currentOperand: '95', overwrite: true }); // 5% off 100 is 95
		});

		it('applies another 5% discount', () => {
			let state = { currentOperand: '95' };
			state = reducer(state, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(state).toEqual({ currentOperand: (95 * 0.95).toString(), overwrite: true }); // 5% off 95
		});

		it('applies a third 5% discount', () => {
			let state = { currentOperand: (95 * 0.95).toString() };
			state = reducer(state, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 5 } });
			expect(state).toEqual({ currentOperand: (95 * 0.95 * 0.95).toString(), overwrite: true }); // 5% off the previous result
		});

		it('applies a -10% discount resulting in 110%', () => {
			let state = { currentOperand: '100' };
			state = reducer(state, { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: -10 } });
			expect(state).toEqual({ currentOperand: '110', overwrite: true }); // 110% of 100 is 110
		});
	});

	it('Fixes this bug:', () => {
		let state = { currentOperand: '0.' };
		state = reducer(state, { type: ACTIONS.DELETE_DIGIT });
		state = reducer(state, { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } });
		expect(state).toEqual({ currentOperand: '0.' });
	});

	describe('division', () => {
		it('divides numbers', () => {
			const state = {
				currentOperand: '2',
				previousOperand: '10',
				operation: '÷',
			};
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('5');
		});

		it('handles division with decimals', () => {
			const state = {
				currentOperand: '3',
				previousOperand: '10',
				operation: '÷',
			};
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('3.333333');
		});
	});

	describe('ADD_DIGIT edge cases', () => {
		it('prevents multiple zeros at start', () => {
			const state = { currentOperand: '0' };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '0' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('0');
		});

		it('prevents multiple decimal points', () => {
			const state = { currentOperand: '1.5' };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('1.5');
		});

		it('adds 0. when decimal is first input', () => {
			const state = { currentOperand: null };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('0.');
		});

		it('replaces 0 with digit', () => {
			const state = { currentOperand: '0' };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('5');
		});

		it('handles overwrite mode', () => {
			const state = { currentOperand: '100', overwrite: true };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('5');
			expect(newState.overwrite).toBe(false);
		});

		it('handles overwrite mode with decimal', () => {
			const state = { currentOperand: '100', overwrite: true };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '.' } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('0.');
		});

		it('handles payload.overwrite flag', () => {
			const state = { currentOperand: '100' };
			const action = { type: ACTIONS.ADD_DIGIT, payload: { digit: '5', overwrite: true } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('5');
		});
	});

	describe('CHOOSE_OPERATION edge cases', () => {
		it('does nothing when both operands are null', () => {
			const state = { currentOperand: null, previousOperand: null, operation: null };
			const action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '+' } };
			const newState = reducer(state, action);
			expect(newState).toEqual(state);
		});

		it('changes operation when only previousOperand exists', () => {
			const state = { currentOperand: null, previousOperand: '5', operation: '+' };
			const action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '-' } };
			const newState = reducer(state, action);
			expect(newState.operation).toBe('-');
		});

		it('evaluates and chains operations', () => {
			const state = { currentOperand: '3', previousOperand: '5', operation: '+' };
			const action = { type: ACTIONS.CHOOSE_OPERATION, payload: { operation: '*' } };
			const newState = reducer(state, action);
			expect(newState.previousOperand).toBe('8');
			expect(newState.operation).toBe('*');
			expect(newState.currentOperand).toBeNull();
		});
	});

	describe('DELETE_DIGIT edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const state = { currentOperand: null };
			const action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('sets to null when deleting last digit', () => {
			const state = { currentOperand: '5' };
			const action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('sets to null when deleting negative single digit', () => {
			const state = { currentOperand: '-5' };
			const action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('removes decimal and preceding digit', () => {
			const state = { currentOperand: '12.' };
			const action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('1');
		});

		it('handles overwrite mode', () => {
			const state = { currentOperand: '100', overwrite: true };
			const action = { type: ACTIONS.DELETE_DIGIT };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
			expect(newState.overwrite).toBe(false);
		});
	});

	describe('EVALUATE edge cases', () => {
		it('does nothing when operation is null', () => {
			const state = { currentOperand: '5', previousOperand: '3', operation: null };
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action);
			expect(newState).toEqual(state);
		});

		it('does nothing when currentOperand is null', () => {
			const state = { currentOperand: null, previousOperand: '3', operation: '+' };
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action);
			expect(newState).toEqual(state);
		});

		it('does nothing when previousOperand is null', () => {
			const state = { currentOperand: '5', previousOperand: null, operation: '+' };
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action);
			expect(newState).toEqual(state);
		});
	});

	describe('SWITCH_SIGN edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const state = { currentOperand: null };
			const action = { type: ACTIONS.SWITCH_SIGN };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('does nothing when currentOperand is 0', () => {
			const state = { currentOperand: '0' };
			const action = { type: ACTIONS.SWITCH_SIGN };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('0');
		});
	});

	describe('APPLY_DISCOUNT edge cases', () => {
		it('does nothing when currentOperand is null', () => {
			const state = { currentOperand: null };
			const action = { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 10 } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBeNull();
		});

		it('handles 100% discount', () => {
			const state = { currentOperand: '100' };
			const action = { type: ACTIONS.APPLY_DISCOUNT, payload: { discount: 100 } };
			const newState = reducer(state, action);
			expect(newState.currentOperand).toBe('0');
		});
	});

	describe('unknown action', () => {
		it('returns state unchanged for unknown action', () => {
			const state = { currentOperand: '5' };
			const action = { type: 'UNKNOWN_ACTION' };
			const newState = reducer(state, action);
			expect(newState).toEqual(state);
		});
	});

	describe('custom precision', () => {
		it('uses custom precision from config', () => {
			const state = {
				currentOperand: '3',
				previousOperand: '10',
				operation: '÷',
			};
			const action = { type: ACTIONS.EVALUATE };
			const newState = reducer(state, action, { precision: 2 });
			expect(newState.currentOperand).toBe('3.33');
		});
	});
});
