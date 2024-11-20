/**
 * SetDifference (same as Exclude)
 * @desc Set difference of given union types `A` and `B`
 * @example
 *   // Expect: "1"
 *   type ResultSet = SetDifference<'1' | '2' | '3', '2' | '3' | '4'>;
 *
 *   // Expect: string | number
 *   type ResultSetMixed = SetDifference<string | number | (() => void), Function>;
 */
export type SetDifference<A, B> = A extends B ? never : A;

/**
 * Omit (complements Pick)
 * @desc From `T` remove a set of properties `K`
 * @example
 *   type Props = { name: string; age: number; visible: boolean };
 *
 *   // Expect: { name: string; visible: boolean; }
 *   type RequiredProps = Omit<Props, 'age'>;
 */
export type Omit<T extends object, K extends keyof T> = T extends any
	? Pick<T, SetDifference<keyof T, K>>
	: never;
