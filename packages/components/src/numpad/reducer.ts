export type Action = {
	type: string;
	payload?: {
		[key: string]: any;
	};
};

export const ACTIONS = {
	ADD_DIGIT: 'add-digit',
	CHOOSE_OPERATION: 'choose-operation',
	CLEAR: 'clear',
	DELETE_DIGIT: 'delete-digit',
	EVALUATE: 'evaluate',
	SWITCH_SIGN: 'switch-sign',
	APPLY_DISCOUNT: 'apply-discount',
};

export type CalculatorState = {
	currentOperand: string | null;
	operation: string | null;
	overwrite?: boolean;
	previousOperand: string | null;
};

export type Config = {
	precision: number;
};

/**
 *
 */
function round(value: number, precision: number): string {
	const multiplier = Math.pow(10, precision);
	return (Math.round(value * multiplier) / multiplier).toString();
}

/**
 *
 */
function evaluate(state: CalculatorState, precision: number): string {
	const prev = parseFloat(state.previousOperand || '');
	const current = parseFloat(state.currentOperand || '');
	if (Number.isNaN(prev) || Number.isNaN(current)) return '';
	let computation = 0;
	switch (state.operation) {
		case '+':
			computation = prev + current;
			break;
		case '-':
			computation = prev - current;
			break;
		case '*':
			computation = prev * current;
			break;
		case '÷':
			computation = prev / current;
			break;
		default:
			break;
	}

	// Round the result and replace the decimal point with the specified decimal separator
	const roundedResult = round(computation, precision);
	return roundedResult;
}

/**
 * currentOperand is always a string with a dot as decimal separator, no thousand separator
 */
export function reducer(state: CalculatorState, action: Action, config?: Config): CalculatorState {
	const { type, payload } = action;
	const precision = config?.precision || 6;

	switch (type) {
		case ACTIONS.ADD_DIGIT:
			if (state.overwrite || payload.overwrite) {
				return {
					...state,
					currentOperand: payload.digit,
					overwrite: false,
				};
			}
			if (payload.digit === '0' && state.currentOperand === '0') {
				return state;
			}
			if (payload.digit === '.' && state.currentOperand && state.currentOperand.includes('.')) {
				return state;
			}
			if (payload.digit === '.' && state.currentOperand == null) {
				return {
					...state,
					currentOperand: '0.',
				};
			}
			if (state.currentOperand === '0') {
				return {
					...state,
					currentOperand: payload.digit,
				};
			}

			return {
				...state,
				currentOperand: `${state.currentOperand || ''}${payload.digit}`,
			};
		case ACTIONS.CHOOSE_OPERATION:
			if (state.currentOperand == null && state.previousOperand == null) {
				return state;
			}

			if (state.currentOperand == null) {
				return {
					...state,
					operation: payload.operation,
				};
			}

			if (state.previousOperand == null) {
				return {
					...state,
					operation: payload.operation,
					previousOperand: state.currentOperand,
					currentOperand: null,
				};
			}

			return {
				...state,
				previousOperand: evaluate(state, precision),
				operation: payload.operation,
				currentOperand: null,
			};
		case ACTIONS.CLEAR:
			return {
				currentOperand: null,
				operation: null,
				overwrite: false,
				previousOperand: null,
			};
		case ACTIONS.DELETE_DIGIT:
			if (state.overwrite) {
				return {
					...state,
					overwrite: false,
					currentOperand: null,
				};
			}
			if (state.currentOperand == null) return state;
			if (state.currentOperand.length === 1) {
				return { ...state, currentOperand: null };
			}

			if (state.currentOperand.endsWith('.')) {
				if (state.currentOperand.length <= 1) {
					// Operand is only the decimalSeparator
					return { ...state, currentOperand: null };
				} else {
					// Remove the decimalSeparator and the preceding digit
					return {
						...state,
						currentOperand: state.currentOperand.slice(0, -2),
					};
				}
			}

			return {
				...state,
				currentOperand: state.currentOperand.slice(0, -1),
			};
		case ACTIONS.EVALUATE:
			if (
				state.operation == null ||
				state.currentOperand == null ||
				state.previousOperand == null
			) {
				return state;
			}

			return {
				...state,
				overwrite: true,
				previousOperand: null,
				operation: null,
				currentOperand: evaluate(state, precision),
			};
		case ACTIONS.SWITCH_SIGN:
			if (!state.currentOperand || state.currentOperand === '0') return state;
			if (state.currentOperand.startsWith('-')) {
				return {
					...state,
					currentOperand: state.currentOperand.slice(1),
				};
			}
			return {
				...state,
				currentOperand: `-${state.currentOperand}`,
			};
		case ACTIONS.APPLY_DISCOUNT: {
			if (!state.currentOperand) return state;
			const current = parseFloat(state.currentOperand);
			const discountMultiplier = (100 - payload.discount) / 100;
			const computation = current * discountMultiplier;
			const roundedResult = round(computation, precision);

			return {
				...state,
				currentOperand: roundedResult,
				overwrite: true,
			};
		}
		default:
			return state;
	}
}

/**
 * Intl not available in react-native, will need to refactor
 */
// const INTEGER_FORMATTER = new Intl.NumberFormat('en-us', {
// 	maximumFractionDigits: 0,
// });

export function formatOperand(operand) {
	// if (operand == null) return;
	// const [integer, decimal] = operand.split('.');
	// if (decimal == null) return INTEGER_FORMATTER.format(integer);
	// return `${INTEGER_FORMATTER.format(integer)}.${decimal}`;
}
