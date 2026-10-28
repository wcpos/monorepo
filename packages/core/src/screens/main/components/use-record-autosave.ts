import * as React from 'react';

import { useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';

import { metaForWrite } from './meta-for-write';
import { taxClassToWire } from '../hooks/tax-class';

import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

type MetaRows = Parameters<typeof metaForWrite>[0];

/** A form's own patch, optionally with the step that follows ITS write (writes overlap, so the capture lives in the closure). */
export type RecordPatch<P> = Partial<P> | { data: Partial<P>; after?: (written: boolean) => void };

/**
 * The one autosave for an edit form (CODING_STANDARDS §Design, Saving): the changed path's
 * root, the record's wire spellings (tax IDs, custom fields, the tax class), the caller's write,
 * the Saved mark. `useFormChangeHandler` under it has already validated the changed path.
 */
export function useRecordAutosave<T extends FieldValues, P extends object>({
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
	/** The record as it stands, read at write time so custom fields see newly numbered rows; a form with custom fields passes it. */
	stored?: () => P;
	/** The record command, bound by the caller; a truthy result is a landed write. The names `save`/`patch` are the seam ratchet's. */
	persist: (data: Partial<P>, root: string) => Promise<unknown>;
	before?: (root: string) => boolean | Promise<boolean>;
	wire?: (root: string, value: unknown) => unknown;
	compose?: (root: string, wireValue: unknown) => RecordPatch<P> | Promise<RecordPatch<P>>;
	/** Remove record-owned meta from the draft before reconciliation. */
	metaDraft?: (rows: MetaRows) => MetaRows;
}): { flush: () => Promise<boolean> } {
	const markSaved = useMarkSaved();
	const draftMeta = (rows: MetaRows) => metaDraft?.(rows) ?? rows;
	// A row the form opened with is the cashier's to delete, numbered since or not; so is one it wrote.
	const [writtenKeys] = React.useState(
		() =>
			new Set(
				draftMeta((form.getValues('meta_data' as FieldPath<T>) as MetaRows | undefined) ?? [])
					.map((row) => String(row?.key ?? ''))
					.filter(Boolean)
			)
	);
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
								draftMeta(value),
								(stored?.() as { meta_data?: MetaRows } | undefined)?.meta_data ?? [],
								writtenKeys
							)
						: root === 'tax_class'
							? taxClassToWire(value as string | null | undefined)
							: (wire?.(root, value) ?? value);
			const own = (await compose?.(root, wireValue)) ?? ({ [root]: wireValue } as Partial<P>);
			const { data, after } =
				'data' in own && typeof own.after === 'function'
					? (own as { data: Partial<P>; after: (written: boolean) => void })
					: { data: own as Partial<P>, after: undefined };
			const written = Boolean(await persist(data, root));
			after?.(written);
			if (written) markSaved([root]);
			return written;
		},
	});
}
