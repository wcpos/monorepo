import * as React from 'react';

import { useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';

import { metaForWrite } from './meta-for-write';

import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

type MetaRows = Parameters<typeof metaForWrite>[0];

/** A form's own patch, optionally with the step that follows ITS write (writes overlap, so the capture lives in the closure). */
export type RecordPatch<P> = Partial<P> | { data: Partial<P>; after?: (written: boolean) => void };

export function useRecordAutosave<T extends FieldValues, P extends { meta_data?: unknown[] }>({
	form,
	readOnly = false,
	stored,
	persist,
	before,
	wire,
	compose,
	metaDraft,
}: {
	form: UseFormReturn<T>;
	readOnly?: boolean;
	/** Read at write time so reconciliation sees newly numbered stored rows. */
	stored: () => P;
	/** The record command, bound by the caller (`saveCustomerFields(customer, data)`); the names `save`/`patch` are the seam ratchet's. */
	persist: (data: Partial<P>) => Promise<boolean | undefined>;
	before?: (root: string) => boolean | Promise<boolean>;
	wire?: (root: string, value: unknown) => unknown;
	compose?: (root: string, wireValue: unknown) => RecordPatch<P> | Promise<RecordPatch<P>>;
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
			const own = (await compose?.(root, wireValue)) ?? ({ [root]: wireValue } as Partial<P>);
			const { data, after } =
				'data' in own && typeof own.after === 'function'
					? (own as { data: Partial<P>; after: (written: boolean) => void })
					: { data: own as Partial<P>, after: undefined };
			const written = Boolean(await persist(data));
			after?.(written);
			if (written) markSaved([root]);
			return written;
		},
	});
}
