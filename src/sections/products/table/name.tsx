import React, { useState } from 'react';
import TextInput from '../../../components/textinput';
import Product from '../../../models/product/model';

type Props = {
  product: Product;
};

const Name = ({ product }: Props) => {
  const [name, setName] = useState(product.name);
  const handleBlur = (event: any) => product.update({ name });
  return <TextInput value={name} onChangeText={setName} onBlur={handleBlur} />;
};

export default Name;
