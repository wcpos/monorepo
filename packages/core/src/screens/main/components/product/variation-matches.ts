import type { VariationMatch } from '../../../../query';

function isSameAttribute(
	left: Pick<VariationMatch, 'id' | 'name'>,
	right: Pick<VariationMatch, 'id' | 'name'>
): boolean {
	return left.id === right.id && left.name === right.name;
}

export function setVariationMatch(
	matches: VariationMatch[],
	match: VariationMatch
): VariationMatch[] {
	return [...matches.filter((candidate) => !isSameAttribute(candidate, match)), match];
}

export function removeVariationMatch(
	matches: VariationMatch[],
	match: Pick<VariationMatch, 'id' | 'name'>
): VariationMatch[] {
	return matches.filter((candidate) => !isSameAttribute(candidate, match));
}

export function getVariationMatchOption(
	matches: VariationMatch[],
	match: Pick<VariationMatch, 'id' | 'name'>
): string | undefined {
	return matches.find((candidate) => isSameAttribute(candidate, match))?.option;
}
