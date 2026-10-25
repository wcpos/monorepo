import * as React from 'react';

import { useFormChangeHandler, useMarkSaved } from '@wcpos/components/form';
import type { ReadonlyEngineRecord } from '@wcpos/query';

import { metaForWrite } from '../../components/meta-for-write';
import { taxClassToWire } from '../../hooks/tax-class';
import { useCatalogueRecord } from '../commands/use-catalogue-record';

import type { FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

export function useCatalogueAutosave<T extends FieldValues>({
	record,
	form,
	readOnly,
	wire,
}: {
	record: ReadonlyEngineRecord<'products'> | ReadonlyEngineRecord<'variations'>;
	form: UseFormReturn<T>;
	/** The licence-gated read-only form never writes: the route is closed to it, a typed URL is not. */
	readOnly: boolean;
	/** A form's own mapping for a root the hook does not know (the product's categories). */
	wire?: (root: string, value: unknown) => unknown;
}): { flush: () => Promise<boolean> } {
	const { saveCatalogueFields } = useCatalogueRecord();
	const markSaved = useMarkSaved();
	const writtenRef = React.useRef(new Set<string>());
	const { flush } = useFormChangeHandler({
		form,
		onChange: async (changes) => {
			if (readOnly) return false;
			const root = Object.keys(changes)[0].split('.')[0] as FieldPath<T>;
			const value = form.getValues(root);
			const wireValue =
				root === 'tax_class'
					? taxClassToWire(value)
					: root === 'meta_data' && Array.isArray(value)
						? metaForWrite(value, record.getLatest().payload.meta_data ?? [], writtenRef.current)
						: wire
							? wire(root, value)
							: value;
			const written = await saveCatalogueFields(record, { [root]: wireValue });
			if (written) markSaved([root]);
			return written;
		},
	});
	return { flush };
}
