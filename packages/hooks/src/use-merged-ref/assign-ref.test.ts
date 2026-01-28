import * as React from 'react';

import { assignRef } from './assign-ref';

describe('use-merged-ref/assign-ref', () => {
	describe('assignRef', () => {
		describe('with callback ref', () => {
			it('should call callback ref with value', () => {
				const callbackRef = jest.fn();
				const value = { test: 'value' };

				assignRef(callbackRef, value);

				expect(callbackRef).toHaveBeenCalledTimes(1);
				expect(callbackRef).toHaveBeenCalledWith(value);
			});

			it('should call callback ref with null', () => {
				const callbackRef = jest.fn();

				assignRef(callbackRef, null);

				expect(callbackRef).toHaveBeenCalledWith(null);
			});

			it('should handle HTMLElement values', () => {
				const callbackRef = jest.fn();
				const element = document.createElement('div');

				assignRef(callbackRef, element);

				expect(callbackRef).toHaveBeenCalledWith(element);
			});
		});

		describe('with object ref (RefObject)', () => {
			it('should set current property on object ref', () => {
				const objectRef: React.MutableRefObject<string | null> = { current: null };
				const value = 'test value';

				assignRef(objectRef, value);

				expect(objectRef.current).toBe(value);
			});

			it('should set current to null', () => {
				const objectRef: React.MutableRefObject<string | null> = { current: 'initial' };

				assignRef(objectRef, null);

				expect(objectRef.current).toBeNull();
			});

			it('should handle HTMLElement values', () => {
				const objectRef: React.MutableRefObject<HTMLElement | null> = { current: null };
				const element = document.createElement('div');

				assignRef(objectRef, element);

				expect(objectRef.current).toBe(element);
			});

			it('should overwrite existing value', () => {
				const objectRef: React.MutableRefObject<number | null> = { current: 1 };

				assignRef(objectRef, 2);

				expect(objectRef.current).toBe(2);
			});
		});

		describe('with null ref', () => {
			it('should not throw when ref is null', () => {
				expect(() => {
					assignRef(null, 'value');
				}).not.toThrow();
			});
		});

		describe('with invalid ref types', () => {
			it('should handle undefined gracefully', () => {
				// TypeScript would normally prevent this, but testing runtime behavior
				expect(() => {
					assignRef(undefined as any, 'value');
				}).not.toThrow();
			});

			it('should not modify object without current property', () => {
				const notARef = { something: 'else' };

				expect(() => {
					assignRef(notARef as any, 'value');
				}).not.toThrow();

				expect(notARef).not.toHaveProperty('current');
			});
		});

		describe('type safety', () => {
			it('should work with different value types', () => {
				// String
				const stringRef: React.MutableRefObject<string | null> = { current: null };
				assignRef(stringRef, 'hello');
				expect(stringRef.current).toBe('hello');

				// Number
				const numberRef: React.MutableRefObject<number | null> = { current: null };
				assignRef(numberRef, 42);
				expect(numberRef.current).toBe(42);

				// Object
				const objectRef: React.MutableRefObject<{ id: number } | null> = { current: null };
				assignRef(objectRef, { id: 1 });
				expect(objectRef.current).toEqual({ id: 1 });

				// Array
				const arrayRef: React.MutableRefObject<number[] | null> = { current: null };
				assignRef(arrayRef, [1, 2, 3]);
				expect(arrayRef.current).toEqual([1, 2, 3]);
			});
		});
	});
});
