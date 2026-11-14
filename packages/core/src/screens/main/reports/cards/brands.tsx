import * as React from 'react';

import { CategoriesCard } from './categories';

// Same local-product grouping and donut as Categories; the section owns the feature gate.
export function BrandsCard() {
	return <CategoriesCard group="brands" />;
}
