# Showcase seed

The showcase seed gives a demo store a lived-in month. It plans about forty named
customers, a few shop-like coupons, and a month of orders per store: cash and card,
a few refunds, a few parked orders, spread across the day the way a real shop is
busy. Reports, Orders and Customers then read like a shop that trades.

It applies to the targets in `targets.mjs`: `demo` (demo.wcpos.com, four stores)
and `dev-free` (one store). Nothing else.

## The plan

`plan.mjs` is pure. It makes no request and reads no clock: the only time it knows
is the `through` it is given. Each store and day draws from its own seed, so a
later day, or a later `through`, never changes an order already planned. Every
order has a stable key, `<store>-<YYYYMMDD>-<seq>`, and that key is what makes a
re-run safe.

Every value comes from the fixed lists in `targets.mjs`. Emails are all on
`example.com`. Phone numbers come from the ranges set aside for fiction.

`node --test apps/main/e2e/showcase/*.check.mjs` runs the checks
(`pnpm --filter @wcpos/main test:showcase` does the same).

## Output is counts only

The seed talks to a store that holds real customer data. What it prints is
counts, ids, HTTP status codes and WordPress error codes. It never prints a
response body, a name, an email, an address or a credential.

## Running it

```sh
node apps/main/e2e/showcase/cli.mjs plan   --target demo [--through <ISO>]
node apps/main/e2e/showcase/cli.mjs apply  --target demo --credentials-cmd <path> [--yes] [--limit N] [--through <ISO>]
node apps/main/e2e/showcase/cli.mjs verify --target demo --credentials-cmd <path> [--through <ISO>]
```

`plan` makes no request. `apply` without `--yes` only reads, and prints what it would write;
with `--yes` it writes customers, coupons and orders, one write at a time. `verify` only
reads, and counts per store what was found, missing, completed, parked, refunded, taxed,
paid on the wrong day, and orders per hour. `--credentials-cmd` is a program that prints one
JSON line with `username` and `password`. **The first live run uses `--limit 1`.**

## One order, four steps, in this order

1. **Create** the order parked (`pos-open`), with no billing email.
2. **Complete** it with `_order_stock_reduced` already `yes`, plus the till meta. A parked
   order takes only the till meta and stops here.
3. **Backdate** `_date_paid` and `_date_completed` to the sale time, and add a named
   customer's billing email.
4. **Refund** one unit of the first line, where planned, with no gateway call and no restock.

Completing is when WooCommerce would mail and reduce stock: with no email there is nobody
to mail, and with the flag set there is nothing to drain. Completing also stamps the paid
date as now, so the backdate comes after it. If the first new order moves stock, or does
not read back completed and backdated, the run stops. The bends: `_date_paid`,
`_date_completed` and `_order_stock_reduced` lean on WooCommerce mapping internal meta keys
to its setters, and a refund's own date is the day it was applied. Refunding an order's only
unit moves it to `refunded`, which `verify` counts with the completed orders.

A re-run finds orders by `_wcpos_showcase_key` and does only the steps still missing, so it
never duplicates one. A failed write stops the run; the next run resumes. Existing customers
and coupons are left alone. A customer created by the seed gets WooCommerce's new-account mail,
sent to a reserved `example.com` address nobody reads. A changed cashier or register list updates only the till meta.
