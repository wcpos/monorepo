import React from 'react';
import Img from '../../../components/image';
import Product from '../../../models/product/model';

type Props = {
  product: Product;
};

const Image = ({ product }: Props) => {
  return <Img source={product.thumbnail} style={{ width: 100, height: 100 }} />;
};

export default Image;
