/**
 * @jest-environment jsdom
 */
import * as React from 'react';
import { renderHook, act } from '@testing-library/react';

import { mergeRefs, useMergedRef } from './use-merged-ref';

describe('use-merged-ref', () => {
	describe('mergeRefs', () => {
		it('should return a function', () => {
			const result = mergeRefs();
			expect(typeof result).toBe('function');
		});

		it('should assign value to all callback refs', () => {
			const ref1 = jest.fn();
			const ref2 = jest.fn();
			const ref3 = jest.fn();

			const merged = mergeRefs(ref1, ref2, ref3);
			const element = document.createElement('div');

			merged(element);

			expect(ref1).toHaveBeenCalledWith(element);
			expect(ref2).toHaveBeenCalledWith(element);
			expect(ref3).toHaveBeenCalledWith(element);
		});

		it('should assign value to all object refs', () => {
			const ref1: React.MutableRefObject<HTMLDivElement | null> = { current: null };
			const ref2: React.MutableRefObject<HTMLDivElement | null> = { current: null };

			const merged = mergeRefs(ref1, ref2);
			const element = document.createElement('div');

			merged(element);

			expect(ref1.current).toBe(element);
			expect(ref2.current).toBe(element);
		});

		it('should handle mixed callback and object refs', () => {
			const callbackRef = jest.fn();
			const objectRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };

			const merged = mergeRefs(callbackRef, objectRef);
			const element = document.createElement('div');

			merged(element);

			expect(callbackRef).toHaveBeenCalledWith(element);
			expect(objectRef.current).toBe(element);
		});

		it('should handle null refs gracefully', () => {
			const validRef = jest.fn();

			const merged = mergeRefs(null, validRef, null);
			const element = document.createElement('div');

			expect(() => merged(element)).not.toThrow();
			expect(validRef).toHaveBeenCalledWith(element);
		});

		it('should pass null to all refs when unmounting', () => {
			const ref1 = jest.fn();
			const ref2: React.MutableRefObject<HTMLDivElement | null> = { current: document.createElement('div') };

			const merged = mergeRefs(ref1, ref2);

			merged(null);

			expect(ref1).toHaveBeenCalledWith(null);
			expect(ref2.current).toBeNull();
		});
	});

	describe('useMergedRef', () => {
		it('should return a stable callback when refs dont change', () => {
			const ref1 = jest.fn();
			const ref2: React.MutableRefObject<string | null> = { current: null };

			const { result, rerender } = renderHook(() => useMergedRef(ref1, ref2));

			const firstCallback = result.current;
			rerender();
			const secondCallback = result.current;

			expect(firstCallback).toBe(secondCallback);
		});

		it('should work with React component refs', () => {
			const localRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };
			const forwardedRef = jest.fn();

			const { result } = renderHook(() => useMergedRef(localRef, forwardedRef));

			const element = document.createElement('div');

			act(() => {
				result.current(element);
			});

			expect(localRef.current).toBe(element);
			expect(forwardedRef).toHaveBeenCalledWith(element);
		});

		it('should handle useState setter as ref', () => {
			const [value, setValue] = [null as HTMLDivElement | null, jest.fn()];
			const objectRef: React.MutableRefObject<HTMLDivElement | null> = { current: null };

			const { result } = renderHook(() =>
				useMergedRef(setValue as React.Dispatch<React.SetStateAction<HTMLDivElement | null>>, objectRef)
			);

			const element = document.createElement('div');

			act(() => {
				result.current(element);
			});

			expect(setValue).toHaveBeenCalledWith(element);
			expect(objectRef.current).toBe(element);
		});
	});
});
