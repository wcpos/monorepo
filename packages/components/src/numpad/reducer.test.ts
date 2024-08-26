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
});
