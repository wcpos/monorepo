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
