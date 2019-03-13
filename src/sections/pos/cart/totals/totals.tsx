import React from 'react';
import useObservable from '../../../../hooks/use-observable';

interface Props {
  order: any;
}

const Totals = ({ order }: Props) => {
  const items = useObservable(order.line_items.observeWithColumns(['quantity', 'total']));

  const total =
    items &&
    items.reduce((result: any, line_item: any) => {
      result += line_item.calculatedTotal;
      return result;
    }, 0);

  return (
    <div>
      <p>Order Total: {order.total}</p>
      <p>Calc Total: {total}</p>
    </div>
  );
};

export default Totals;
