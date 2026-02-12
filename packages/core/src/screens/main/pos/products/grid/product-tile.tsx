import * as React from 'react';
import { Pressable, View } from 'react-native';

import get from 'lodash/get';
import { useObservableEagerState } from 'observable-hooks';

import { Image } from '@wcpos/components/image';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../../contexts/translations';
import { PriceWithTax } from '../../../components/product/price-with-tax';
import { useImageAttachment } from '../../../hooks/use-image-attachment';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useAddProduct } from '../../hooks/use-add-product';

type ProductDocument = import('@wcpos/database').ProductDocument;

interface GridFields {
	name: boolean;
	price: boolean;
	tax: boolean;
	on_sale: boolean;
	category: boolean;
	sku: boolean;
	barcode: boolean;
	stock_quantity: boolean;
	cost_of_goods_sold: boolean;
}

interface ProductTileProps {
	product: ProductDocument;
	gridFields: GridFields;
}

export function ProductTile({ product, gridFields }: ProductTileProps) {
	const t = useT();
	const { addProduct } = useAddProduct();
	const { format } = useCurrencyFormat();
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

	const imageSource = !uri || error ? { uri: 'https://via.placeholder.com/150' } : { uri };

	const safeTaxStatus = (taxStatus || 'none') as 'taxable' | 'shipping' | 'none';
	const taxDisplay = gridFields.tax ? ('text' as const) : ('none' as const);
	const showOnSale = gridFields.on_sale && onSale;
	const hasAnyField =
		gridFields.name ||
		gridFields.price ||
		gridFields.sku ||
		gridFields.barcode ||
		gridFields.category ||
		gridFields.stock_quantity ||
		gridFields.cost_of_goods_sold;

	const handlePress = React.useCallback(() => {
		addProduct(product);
	}, [addProduct, product]);

	return (
		<Pressable
			onPress={handlePress}
			className="bg-card border-border m-1 flex-1 overflow-hidden rounded-lg border"
			testID="product-tile"
		>
			<View className="aspect-square">
				<Image source={imageSource} recyclingKey={product.uuid} className="h-full w-full" />
			</View>
			{hasAnyField && (
				<VStack className="p-2" space="xs">
					{gridFields.name && (
						<Text className="font-bold" numberOfLines={2} decodeHtml>
							{name}
						</Text>
					)}
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
						<Text className="text-muted-foreground text-xs">
							{t('common.sku')}: {sku}
						</Text>
					) : null}
					{gridFields.barcode && barcode ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.barcode')}: {barcode}
						</Text>
					) : null}
					{gridFields.category && categories.length > 0 && (
						<Text className="text-muted-foreground text-xs" numberOfLines={1} decodeHtml>
							{categories.map((c) => c.name ?? '').join(', ')}
						</Text>
					)}
					{gridFields.stock_quantity && stockQuantity != null && (
						<Text className="text-muted-foreground text-xs">
							{t('common.stock')}: {stockQuantity}
						</Text>
					)}
					{gridFields.cost_of_goods_sold && costOfGoodsSold != null ? (
						<Text className="text-muted-foreground text-xs">
							{t('common.cogs')}: {format(costOfGoodsSold?.total_value || 0)}
						</Text>
					) : null}
				</VStack>
			)}
		</Pressable>
	);
}
