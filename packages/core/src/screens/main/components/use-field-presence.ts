import * as React from 'react';

export interface FieldSpec<Name extends string> {
	name: Name;
	/** Asked for by the till (identity, the till's job, or Woo requires it): always a row. */
	asked?: boolean;
}

/**
 * Which of a record's facts are rows (property rows, Paul 2026-10-25). Presence is per record,
 * not per session: an asked field is always present; a field with a value is present; a field
 * the owner added, or one that held a value, stays present once emptied until its Remove. Both
 * lists keep the array's canonical order, so an added field lands in its place, never appended.
 */
export function useFieldPresence<Name extends string>(
	fields: readonly FieldSpec<Name>[],
	isEmpty: (name: Name) => boolean,
	onClear?: (name: Name) => void
) {
	const filled = fields.filter((field) => !isEmpty(field.name)).map((field) => field.name);
	const [kept, setKept] = React.useState<ReadonlySet<Name>>(() => new Set(filled));
	// A value that arrives later keeps its row too: adjusted during render, not in an effect.
	const unseen = filled.filter((name) => !kept.has(name));
	if (unseen.length > 0) setKept(new Set([...kept, ...unseen]));

	const isPresent = (field: FieldSpec<Name>) =>
		Boolean(field.asked) || kept.has(field.name) || !isEmpty(field.name);
	const add = (name: Name) => setKept((current) => new Set(current).add(name));
	const remove = (name: Name) => {
		setKept((current) => new Set([...current].filter((item) => item !== name)));
		onClear?.(name);
	};
	return {
		present: fields.filter(isPresent).map((field) => field.name),
		offered: fields.filter((field) => !isPresent(field)).map((field) => field.name),
		add,
		remove,
	};
}
