import type { ReadonlyEngineRecord } from '@wcpos/query';

import { useRecordAutosave } from '../../components/use-record-autosave';
import { taxClassToWire } from '../../hooks/tax-class';
import { useCatalogueRecord } from '../commands/use-catalogue-record';

import type { FieldValues, UseFormReturn } from 'react-hook-form';

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
	return useRecordAutosave({
		form,
		readOnly,
		stored: () => record.getLatest().payload,
		save: (patch) => saveCatalogueFields(record, patch),
		wire: (root, value) =>
			root === 'tax_class'
				? taxClassToWire(value as string | null | undefined)
				: (wire?.(root, value) ?? value),
	});
}
