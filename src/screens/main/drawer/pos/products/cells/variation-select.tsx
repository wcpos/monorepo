import * as React from 'react';

import { useVariations } from '../../../../../../contexts/variations/use-variations';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface VariationSelectProps {
	parent: ProductDocument;
	variations: ProductVariationDocument[];
}

export const VariationSelect = ({ parent, variations }: VariationSelectProps) => {
	debugger;
	return null;
};
