import * as React from 'react';
import { Pressable, View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';
import { Popover, PopoverContent, PopoverTrigger } from '@wcpos/components/popover';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { VariationsPopover } from '../cells/variations-popover';
import { useT } from '../../../../../contexts/translations';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { useAddVariation } from '../../hooks/use-add-variation';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type ProductDocument = import('@wcpos/database').ProductDocument;
type ProductVariationDocument = import('@wcpos/database').ProductVariationDocument;

interface MetaData {
	attr_id: number;
	display_key?: string;
	display_value?: string;
}

interface GridFields {
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

interface VariableProductTileProps {
	product: ProductDocument;
	gridFields: GridFields;
}

export function VariableProductTile({ product, gridFields }: VariableProductTileProps) {
	const t = useT();
	const { addVariation } = useAddVariation();
	const { format } = useCurrencyFormat();
	const triggerRef = React.useRef<{ close: () => void } | null>(null);

	const name = useObservableEagerState(product.name$!);
	const images = useObservableEagerState(product.images$!);
	const imageURL = get(images, [0, 'src'], undefined);
	const { uri, error } = useImageAttachment(product, imageURL ?? '');
	const price = useObservableEagerState(product.price$!);
	const regularPrice = useObservableEagerState(product.regular_price$!);
	const onSale = useObservableEagerState(product.on_sale$!);
	const taxStatus = useObservableEagerState(product.tax_status$!);
	const taxClass = useObservableEagerState(product.tax_class$!);
	const categories = useObservableEagerState(product.categories$!) || [];
	const sku = useObservableEagerState(product.sku$!);
	const barcode = useObservableEagerState(product.barcode$!);
	const stockQuantity = useObservableEagerState(product.stock_quantity$!);
	const costOfGoodsSold = useObservableEagerState(product.cost_of_goods_sold$!);

	const imageSource = error ? { uri: 'https://via.placeholder.com/150' } : { uri };

	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('tooltip' as const);
	const showOnSale = gridFields.on_sale && onSale;

	const addToCart = React.useCallback(
		(variation: ProductVariationDocument | ProductDocument, metaData: MetaData[]) => {
			addVariation(variation as ProductVariationDocument, product, metaData);
			if (triggerRef.current) {
				triggerRef.current.close();
			}
		},
		[addVariation, product]
	);

	return (
		<Popover>
			<PopoverTrigger ref={triggerRef as React.RefObject<never>} asChild>
				<Pressable
					className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border"
					testID="variable-product-tile"
				>
					<View className="aspect-square">
						<Image source={imageSource} recyclingKey={product.uuid} className="h-full w-full" />
						<View className="absolute top-1 right-1 rounded bg-black/50 px-1 py-0.5">
							<Text className="text-xs text-white">{t('common.variants')}</Text>
						</View>
					</View>
					<VStack className="p-2" space="xs">
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{name}
						</Text>
						{gridFields.price && (
							<>
								{showOnSale ? (
									<VStack space="xs">
										<PriceWithTax
											price={regularPrice ?? ''}
											taxStatus={safeTaxStatus}
											taxClass={taxClass ?? ''}
											taxDisplay={taxDisplay}
											strikethrough
										/>
										<PriceWithTax
											price={price ?? ''}
											taxStatus={safeTaxStatus}
											taxClass={taxClass ?? ''}
											taxDisplay={taxDisplay}
										/>
									</VStack>
								) : (
									<PriceWithTax
										price={price ?? ''}
										taxStatus={safeTaxStatus}
										taxClass={taxClass ?? ''}
										taxDisplay={taxDisplay}
									/>
								)}
							</>
						)}
						{gridFields.sku && sku ? (
							<Text className="text-muted-foreground text-xs">SKU: {sku}</Text>
						) : null}
						{gridFields.barcode && barcode ? (
							<Text className="text-muted-foreground text-xs">Barcode: {barcode}</Text>
						) : null}
						{gridFields.category && categories.length > 0 && (
							<Text className="text-muted-foreground text-xs" numberOfLines={1} decodeHtml>
								{categories.map((c) => c.name ?? '').join(', ')}
							</Text>
						)}
						{gridFields.stock_quantity && stockQuantity != null && (
							<Text className="text-muted-foreground text-xs">Stock: {stockQuantity}</Text>
						)}
						{gridFields.cost_of_goods_sold && costOfGoodsSold != null ? (
							<Text className="text-muted-foreground text-xs">
								COGS: {format(costOfGoodsSold?.total_value || 0)}
							</Text>
						) : null}
					</VStack>
				</Pressable>
			</PopoverTrigger>
			<PopoverContent side="bottom" className="w-auto max-w-80 p-2">
				<VariationsPopover parent={product} addToCart={addToCart as never} />
			</PopoverContent>
		</Popover>
	);
}
