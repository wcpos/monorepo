/**
 * Default thermal XML template that replicates the layout of the
 * original hardcoded encodeReceipt encoder.
 *
 * Mustache data context expected:
 *   store.name, store.phone, store.tax_id,
 *   address_lines[].line,
 *   has_address_lines, has_phone, has_tax_id,
 *   order_number, created_at_gmt,
 *   cashier_name, customer_name, customer_tax_id, has_customer_tax_id,
 *   customer_tax_ids[].{type, value, country, label}, has_customer_tax_ids,
 *   infoColLeft, infoColRight, nameColWidth, priceColWidth,
 *   formatted_lines[].{name, detail, line_total_fmt},
 *   subtotal_fmt, has_discount, discount_fmt,
 *   show_tax, tax_lines[].{label, amount_fmt},
 *   grand_total_fmt,
 *   payments[].{method_title, amount_fmt, has_tendered, tendered_fmt, change_fmt},
 *   cut, openDrawer, columns
 */
export const DEFAULT_THERMAL_TEMPLATE = `<receipt paper-width="{{columns}}">
  <align mode="center">
    <bold><text>{{store.name}}</text></bold>
    {{#has_address_lines}}
    {{#address_lines}}
    <text>{{line}}</text>
    {{/address_lines}}
    {{/has_address_lines}}
    {{#has_phone}}
    <text>{{store.phone}}</text>
    {{/has_phone}}
    {{#has_tax_id}}
    <text>Tax ID: {{store.tax_id}}</text>
    {{/has_tax_id}}
  </align>
  <feed lines="1" />
  <line />
  <align mode="center">
    <bold><text>SALES RECEIPT</text></bold>
  </align>
  <row>
    <col width="{{infoColLeft}}">Receipt #</col>
    <col width="{{infoColRight}}" align="right">{{order_number}}</col>
  </row>
  <row>
    <col width="{{infoColLeft}}">Date</col>
    <col width="{{infoColRight}}" align="right">{{created_at_gmt}}</col>
  </row>
  {{#cashier_name}}
  <row>
    <col width="{{infoColLeft}}">Cashier</col>
    <col width="{{infoColRight}}" align="right">{{cashier_name}}</col>
  </row>
  {{/cashier_name}}
  {{#customer_name}}
  <row>
    <col width="{{infoColLeft}}">Customer</col>
    <col width="{{infoColRight}}" align="right">{{customer_name}}</col>
  </row>
  {{/customer_name}}
  {{#has_customer_tax_id}}
  <row>
    <col width="{{infoColLeft}}">Tax ID</col>
    <col width="{{infoColRight}}" align="right">{{customer_tax_id}}</col>
  </row>
  {{/has_customer_tax_id}}
  <line />
  {{#formatted_lines}}
  <text>{{name}}</text>
  <row>
    <col width="{{nameColWidth}}">{{detail}}</col>
    <col width="{{priceColWidth}}" align="right">{{line_total_fmt}}</col>
  </row>
  {{/formatted_lines}}
  <line />
  <row>
    <col width="{{nameColWidth}}">Subtotal</col>
    <col width="{{priceColWidth}}" align="right">{{subtotal_fmt}}</col>
  </row>
  {{#has_discount}}
  <row>
    <col width="{{nameColWidth}}">Discount</col>
    <col width="{{priceColWidth}}" align="right">{{discount_fmt}}</col>
  </row>
  {{/has_discount}}
  {{#show_tax}}
  {{#tax_lines}}
  <row>
    <col width="{{nameColWidth}}">{{label}}</col>
    <col width="{{priceColWidth}}" align="right">{{amount_fmt}}</col>
  </row>
  {{/tax_lines}}
  {{/show_tax}}
  <bold>
  <row>
    <col width="{{nameColWidth}}">TOTAL</col>
    <col width="{{priceColWidth}}" align="right">{{grand_total_fmt}}</col>
  </row>
  </bold>
  <line />
  {{#payments}}
  <row>
    <col width="{{nameColWidth}}">{{method_title}}</col>
    <col width="{{priceColWidth}}" align="right">{{amount_fmt}}</col>
  </row>
  {{#has_tendered}}
  <row>
    <col width="{{nameColWidth}}">  Tendered</col>
    <col width="{{priceColWidth}}" align="right">{{tendered_fmt}}</col>
  </row>
  <row>
    <col width="{{nameColWidth}}">  Change</col>
    <col width="{{priceColWidth}}" align="right">{{change_fmt}}</col>
  </row>
  {{/has_tendered}}
  {{/payments}}
  <feed lines="1" />
  <align mode="center">
    <text>Thank you for your purchase!</text>
  </align>
  <feed lines="2" />
  {{#openDrawer}}
  <drawer />
  {{/openDrawer}}
  {{#cut}}
  <cut />
  {{/cut}}
</receipt>`;
