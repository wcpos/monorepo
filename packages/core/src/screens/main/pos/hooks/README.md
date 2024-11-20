## Calculating cart taxes via the WooCommerce REST API

Calculating cart taxes via the WooCommerce REST API is a complete fucking mess and it will drive you insane if you think about it too long. Just follow the below rules and hope for the best:

### Line Items

1. Orders have a property `prices_include_tax`, ignore it, it means nothing. Line items will always use `price` without tax even if the site setting is inclusive of tax.
2. When submitting a line item, the `price` will be ignored. The only fields that matter are `quantity`, `subtotal` and `total`. The `price`, `subtotal_tax`, `total_tax` and itemized taxes will be recalculated on the server from those fields.
3. The `price` will be returned as a float of `total/quantity`, the precision is up to the server, it could be 10 decimals or more.
4. The precision of data returned from the WC REST API can be set using `$request['dp']`, if not it will default to the store settings, ie: 2. 2 decimal places is not not enough and will likely cause weird rounding issues. 6 decimal places should be used everywhere.
5. Products in WooCommerce can have property `taxable:none`. There is no such property for line items in the cart, it must be handled by the POS via meta data. NOTE: in WooCommerce you can skip the tax calculation if `tax_class` is set to '0', but this is not a valid REST value.

### Fee Lines

1. `fee_lines` has a property called `amount`, it's in the schema and returned as a property, but it always returns empty. Only `total` is used.

### Gotchas

1. Because the `price` is always without tax, the original information is lost once it enters the cart. Changing tax rates once an item is in the cart needs a different way to get the original `price` and `regular_price` for stores that are set to `prices_include_tax:true`.

### Also

WooCommerce devs will change the REST API randomly and without notice. The WooCommerce unit tests for the API are sparce, so it's important to have as many unit tests of our own to alert us to any changes to the API.
