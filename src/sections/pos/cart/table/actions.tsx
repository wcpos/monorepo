import React from 'react';
import Button from '../../../../components/button';

type Props = {
  item: any;
};

const Actions = ({ item }: Props) => {
  const destroyItem = () => {
    item.destroyPermanently();
  };
  return <Button title="X" onPress={destroyItem} />;
};

export default Actions;
