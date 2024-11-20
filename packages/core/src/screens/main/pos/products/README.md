### Performance

I'm not sure if it makes sense to subscribe to each property, and only re-render each cell on changes, eg: product.name$, or to simply subscribe to the product.$ and re-render the entire row on any change.

ie: Does the performance hit of each cell managing its own state, out weigh any benefit of not having to re-render the entire row?

I need to compare the performance of both cases for large lists.

#### Gotchas

If the row item is not kept update-to-date, it is easy to pass around a stale RxDocument. For example: the POS Products addToCart action will not necessarily pass the latest version of the product document to the cart. So either, re-render the action component on any change, or be dilligent to pass the product.getLatest() to any other function.
