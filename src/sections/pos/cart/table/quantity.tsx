import React, { Fragment } from 'react';
import TextInput from '../../../../components/textinput';
import { Text } from 'react-native';

interface Props {
  line_item: any;
}

const Quantity = ({ line_item }: Props) => {
  const handleChange = (quantity: string) => {
    line_item.update({
      quantity: parseFloat(quantity),
    });
  };

  const handleSplit = () => {
    line_item.split();
  };

  return (
    <Fragment>
      <TextInput value={String(line_item.quantity)} onChangeText={handleChange} />
      {line_item.quantity > 1 && <Text onPress={handleSplit}>split</Text>}
    </Fragment>
  );
};

export default Quantity;
