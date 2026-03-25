import type { Option } from '../types';

export function isSelectedIn(
	value: Option<any> | Option<any>[] | undefined,
	targetValue: string,
	multiple: boolean
): boolean {
	if (multiple) {
		return (value as Option<any>[] | undefined)?.some((v) => v.value === targetValue) ?? false;
	}
	return (value as Option<any> | undefined)?.value === targetValue;
}

export function toggleMultiValue<T>(current: Option<T>[], option: Option<T>): Option<T>[] {
	const exists = current.some((v) => v.value === option.value);
	if (exists) {
		return current.filter((v) => v.value !== option.value);
	}
	return [...current, option];
}

export function getDisplayLabel(
	selectedValues: Option<any>[],
	placeholder: string,
	maxLength = 24
): string {
	if (selectedValues.length === 0) {
		return placeholder;
	}

	const labels = selectedValues.map((v) => v.label);
	const fullLabel = labels.join(', ');

	if (fullLabel.length <= maxLength) {
		return fullLabel;
	}

	// Find how many labels fit
	let truncated = '';
	let count = 0;
	for (const label of labels) {
		const next = truncated ? `${truncated}, ${label}` : label;
		if (next.length > maxLength && count > 0) break;
		truncated = next;
		count++;
	}

	const remaining = selectedValues.length - count;
	if (remaining > 0) {
		return `${truncated} +${remaining}`;
	}
	return truncated;
}
