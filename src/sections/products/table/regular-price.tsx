import React, { useState } from 'react';
import TextInput from '../../../components/textinput';
import Product from '../../../models/product/model';

type Props = {
  product: Product;
};

const RegularPrice = ({ product }: Props) => {
  const [regular_price, setRegularPrice] = useState(product.regular_price);
  const handleBlur = (event: any) => product.update({ regular_price });
  return <TextInput value={regular_price} onChangeText={setRegularPrice} onBlur={handleBlur} />;
};

export default RegularPrice;
