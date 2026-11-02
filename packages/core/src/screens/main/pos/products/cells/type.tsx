import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useT } from '../../../../../contexts/translations';

type Kind = 'simple' | 'variable' | 'variation' | 'grouped' | 'external';

/** The kind as a word: the `type` column, which existed in the settings with no cell behind it. */
function TypeWord({ kind }: { kind: string | undefined }) {
	const t = useT();
	const labels: Record<Kind, string> = {
		simple: t('pos_products.type_simple'),
		variable: t('pos_products.type_variable'),
		variation: t('pos_products.type_variation'),
		grouped: t('pos_products.type_grouped'),
		external: t('pos_products.type_external'),
	};
	return kind && kind in labels ? <Text>{labels[kind as Kind]}</Text> : null;
}

/** A product's type, from its payload. */
export function Type({ row }: CellContext<{ record: EngineRecord<'products'> }, string>) {
	const kind = useRecordField(row.original.record, ({ payload }) => payload.type);
	return <TypeWord kind={kind} />;
}

/** A variation row is a variation: the pane registers this cell, so nothing is guessed from the payload. */
export function VariationType() {
	return <TypeWord kind="variation" />;
}
