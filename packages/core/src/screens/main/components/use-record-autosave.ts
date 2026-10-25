import * as React from 'react';

import { useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';

import { metaForWrite } from './meta-for-write';

import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

type MetaRows = Parameters<typeof metaForWrite>[0];

export function useRecordAutosave<T extends FieldValues, P extends { meta_data?: unknown[] }>({
	form,
	readOnly = false,
	stored,
	save,
	before,
	wire,
	patch,
	after,
	metaDraft,
}: {
	form: UseFormReturn<T>;
	readOnly?: boolean;
	/** Read at write time so reconciliation sees newly numbered stored rows. */
	stored: () => P;
	save: (patch: Partial<P>) => Promise<boolean | undefined>;
	before?: (root: string) => boolean | Promise<boolean>;
	wire?: (root: string, value: unknown) => unknown;
	patch?: (root: string, wireValue: unknown) => Partial<P> | Promise<Partial<P>>;
	after?: (root: string, written: boolean) => void;
	/** Remove record-owned meta from the draft before reconciliation. */
	metaDraft?: (rows: MetaRows) => MetaRows;
}): { flush: () => Promise<boolean> } {
	const markSaved = useMarkSaved();
	const writtenRef = React.useRef(new Set<string>());
	return useFormChangeHandler({
		form,
		onChange: async (changes) => {
			if (readOnly) return false;
			const root = Object.keys(changes)[0].split('.')[0] as FieldPath<T>;
			if (before && !(await before(root))) return false;
			// An address writes as a whole; an invalid sibling must not ride along.
			if ((root === 'billing' || root === 'shipping') && !(await form.trigger(root))) return false;
			const value: unknown = form.getValues(root);
			const wireValue =
				root === 'tax_ids' && Array.isArray(value)
					? value.filter((row) => String(row?.value ?? '') !== '')
					: root === 'meta_data' && Array.isArray(value)
						? metaForWrite(
								metaDraft?.(value) ?? value,
								(stored().meta_data ?? []) as MetaRows,
								writtenRef.current
							)
						: (wire?.(root, value) ?? value);
			const written = Boolean(
				await save((await patch?.(root, wireValue)) ?? ({ [root]: wireValue } as Partial<P>))
			);
			after?.(root, written);
			if (written) markSaved([root]);
			return written;
		},
	});
}
