// import { renderHook, act } from '@testing-library/react-hooks';
// import { useCurrencyFormat } from './use-currency-format';

// /**
//  *
//  */
// describe('useCurrencyFormat', () => {
// 	beforeAll(() => {
// 		jest.mock('../use-app-state/use-app-state.tsx', () => ({
// 			useAppState: () => {
// 				return {
// 					currency: 'USD',
// 				};
// 			},
// 		}));
// 		jest.mock('observable-hooks', () => ({
// 			useObservableState: (obs$, initial) => {
// 				return initial;
// 			},
// 		}));
// 	});

// 	/**
// 	 *
// 	 */
// 	test('should export format and unformat functions', () => {
// 		const { format, unformat } = renderHook(useCurrencyFormat);
// 		expect(format).toBeDefined();
// 		expect(unformat).toBeDefined();
// 	});
// 	/**
// 	 *
// 	 */
// });
