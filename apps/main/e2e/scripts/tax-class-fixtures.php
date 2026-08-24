<?php
/**
 * E2E tax-class fixture products.
 *
 * Both dev stores already carry `reduced-rate` and `zero-rate` tax classes with real
 * rates behind them, but as of 2026-08-24 NOT ONE of ~2,050 published products used
 * either, and not one had a tax status other than `taxable`. The classes existed and
 * were unreachable from any cart, so every money test the suite has ever run —
 * including the oracle that caught the 2026-08-24 line-tax bugs — exercised the
 * standard class only.
 *
 * These three products close that. They are deliberately priced 9.99 so their tax is
 * never a whole cent at any common rate (5% -> 0.4995), which is what makes them
 * useful: a fixture whose tax lands on a clean cent cannot tell a correct rounding
 * rule from a broken one.
 *
 * Run on any store that needs them — idempotent, keyed by well-known SKU, and skips
 * anything already present, exactly like the `e2e-product-writer` identity:
 *
 *     wp eval-file tax-class-fixtures.php --user=1
 *
 * `--user=1` is required. `wp eval-file` runs as user 0 otherwise, and WooCommerce
 * skips work that needs capabilities without reporting an error.
 *
 * Specs that need these SKUs must skip-with-reason when they are absent, never fail —
 * a store that has not been provisioned is a declared-missing environment, not a
 * regression. Marker for finding or removing them: `_wcpos_fixture_source` =
 * `e2e-tax-classes`.
 */
/*
 * 1. Rates. Wherever the store taxes at the STANDARD rate, make sure the reduced-rate
 *    and zero-rate classes have a rate there too. Without this the fixtures below ring
 *    up untaxed and silently prove nothing — which is exactly what dev-pro did on
 *    2026-08-24: its reduced-rate rate was scoped GB while its POS outlets are US:AL,
 *    so the reduced-rate product behaved as a second non-taxable line and the spec
 *    still went green.
 */
global $wpdb;
$countries = $wpdb->get_col(
    "SELECT DISTINCT tax_rate_country FROM {$wpdb->prefix}woocommerce_tax_rates
     WHERE tax_rate_class = '' AND tax_rate_country <> ''"
);
foreach ($countries as $country) {
    foreach ([['reduced-rate', '5.0000', 'Reduced'], ['zero-rate', '0.0000', 'Zero Rate']] as [$class, $rate, $name]) {
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT tax_rate_id FROM {$wpdb->prefix}woocommerce_tax_rates
             WHERE tax_rate_country = %s AND tax_rate_class = %s LIMIT 1",
            $country, $class
        ));
        if ($existing) {
            printf("SKIP   rate %-13s %s already present (#%d)\n", $class, $country, $existing);
            continue;
        }
        $id = WC_Tax::_insert_tax_rate([
            'tax_rate_country'  => $country,
            'tax_rate_state'    => '',
            'tax_rate'          => $rate,
            'tax_rate_name'     => $country . ' ' . $name,
            'tax_rate_priority' => 1,
            'tax_rate_compound' => 0,
            'tax_rate_shipping' => 0,
            'tax_rate_class'    => $class,
        ]);
        printf("CREATE rate %-13s %s #%d @ %s%%\n", $class, $country, $id, $rate);
    }
}
WC_Cache_Helper::get_transient_version('taxes', true);

/* 2. Products. */
$fixtures = [
    ['sku' => 'e2e-tax-reduced', 'name' => 'E2E Tax Fixture - Reduced Rate', 'class' => 'reduced-rate', 'status' => 'taxable', 'price' => '9.99'],
    ['sku' => 'e2e-tax-zero',    'name' => 'E2E Tax Fixture - Zero Rate',    'class' => 'zero-rate',    'status' => 'taxable', 'price' => '9.99'],
    ['sku' => 'e2e-tax-none',    'name' => 'E2E Tax Fixture - Not Taxable',  'class' => '',             'status' => 'none',    'price' => '9.99'],
];
foreach ($fixtures as $f) {
    $existing = wc_get_product_id_by_sku($f['sku']);
    if ($existing) {
        $p = wc_get_product($existing);
        printf("SKIP  %-18s already exists (#%d) class=%s status=%s\n", $f['sku'], $existing, $p->get_tax_class() ?: '(standard)', $p->get_tax_status());
        continue;
    }
    $p = new WC_Product_Simple();
    $p->set_name($f['name']);
    $p->set_sku($f['sku']);
    $p->set_regular_price($f['price']);
    $p->set_price($f['price']);
    $p->set_tax_class($f['class']);
    $p->set_tax_status($f['status']);
    $p->set_catalog_visibility('visible');
    $p->set_status('publish');
    $p->set_manage_stock(false);
    $p->update_meta_data('_wcpos_fixture_source', 'e2e-tax-classes');
    $id = $p->save();
    printf("CREATE %-18s #%d class=%s status=%s price=%s\n", $f['sku'], $id, $f['class'] ?: '(standard)', $f['status'], $f['price']);
}
