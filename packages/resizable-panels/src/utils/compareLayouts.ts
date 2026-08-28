import { areEqual } from './arrays';

export function compareLayouts(a: number[], b: number[]): boolean {
	return areEqual(a, b);
}
