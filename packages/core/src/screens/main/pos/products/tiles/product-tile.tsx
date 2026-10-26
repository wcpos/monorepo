import * as React from 'react';
import { type ViewInstance } from 'react-native';

import { PosterTile } from '@wcpos/components/poster-tile';
import { type EngineRecord } from '@wcpos/query';

import { InCartCount, useProductCount } from '../rows/product-row';
import { useAddProduct } from '../../hooks/use-add-product';
import { useRenderProbe } from '../render-probe';
import { type GridFields, useProductPicture, useProductWords } from './tile-words';
import { type Measurable, useLiftedLayout } from '../deal-stack';

export type { GridFields };

interface ProductTileProps {
	record: EngineRecord<'products'>;
	gridFields: GridFields;
	/** The tile itself goes along, so a drill-in can start from where it sits. */
	onDrill?: (record: EngineRecord<'products'>, target?: Measurable) => void;
	lifted?: boolean;
	/** In a dealt cell the tile grows to its row's height (as `VariationTile`). */
	grow?: boolean;
}

/** A product on the Poster tile, with the fields enabled for the product grid. */
export function ProductTile({ record, gridFields, onDrill, lifted, grow }: ProductTileProps) {
	const tile = React.useRef<ViewInstance>(null);
	const count = useProductCount(record);
	const { addProduct } = useAddProduct();
	const picture = useProductPicture(record);
	const onLayout = useLiftedLayout(lifted);
	const { t, format, stock, fields, out, mark, title, money, sub, facts } = useProductWords(
		record,
		gridFields,
		!!onDrill
	);

	// Troubleshooting probe (render-probe.ts): which of these moved when the tile re-rendered.
	useRenderProbe('ProductTile', record.uuid, {
		record,
		gridFields,
		onDrill,
		lifted,
		grow,
		count,
		stock,
		fields,
		addProduct,
		format,
		t,
	});

	const id = record.remoteId ?? record.uuid;
	const testID = onDrill ? 'variable-product-tile' : 'product-tile';

	const handlePress = React.useCallback(async () => {
		if (onDrill) onDrill(record, tile.current);
		else await addProduct(record);
	}, [addProduct, record, onDrill]);

	return (
		<PosterTile
			ref={tile}
			picture={picture}
			mark={mark?.mark}
			markLabel={mark?.label}
			markTestID={`product-tile-stock-${id}`}
			// Always mounted: the count has to be there before the first add to show it land.
			corner={<InCartCount product={record.uuid} count={count} />}
			title={title}
			money={money}
			sub={sub}
			facts={facts}
			out={out}
			stacked={!!onDrill}
			grow={grow}
			lifted={lifted}
			onLayout={onLayout}
			onPress={handlePress}
			accessibilityLabel={fields.name ?? ''}
			testID={testID}
			squareTestID={`${testID}-${id}`}
		/>
	);
}
