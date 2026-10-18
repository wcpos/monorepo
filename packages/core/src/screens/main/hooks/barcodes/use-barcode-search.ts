import * as React from 'react';

import { readProductByWooId, searchCatalogByBarcode, useQueryRuntime } from '@wcpos/query';

export const useBarcodeSearch = () => {
	const runtime = useQueryRuntime();
	const barcodeSearch = React.useCallback(
		(barcode: string, symbology?: string) =>
			searchCatalogByBarcode(runtime.engine, barcode, symbology),
		[runtime]
	);
	const findProductById = React.useCallback(
		(productId: number) => readProductByWooId(runtime.engine, productId),
		[runtime]
	);

	return { barcodeSearch, findProductById };
};
