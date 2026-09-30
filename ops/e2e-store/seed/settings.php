<?php
/**
 * Store settings and tax rates for the E2E store. Idempotent.
 *
 *     wp eval-file /e2e-ops/seed/settings.php --user=1
 *
 * Currency and number formatting copy dev-next's Store API (GBP, "," decimal,
 * "." thousands, "25,00 £"), so specs keep meeting a non-"." decimal separator.
 *
 * Tax regime, chosen for what the money specs can detect:
 *   - prices entered inclusive of tax (pos-money-oracle's 1.00-incl-10% shape);
 *   - GB base: VAT 20% plus a 2% COMPOUND surcharge at priority 2, the regime
 *     pos-checkout.spec.ts describes for dev-next (x1.224);
 *   - US:AL: a state rate plus two compound rates at priorities 2 and 3,
 *     inserted in DESCENDING priority so tax_rate_order and priority disagree
 *     (the mono#1120 tie pos-coupon-apply.spec.ts reports on);
 *   - AU: GST 10%, a repeating-decimal rate for the oracle.
 * The reduced-rate and zero-rate rates for each country come from the suite's
 * own apps/main/e2e/scripts/tax-class-fixtures.php, which seed.sh runs next.
 */

$options = array(
	'woocommerce_default_country'        => 'GB',
	'woocommerce_store_address'          => '1 E2E Street',
	'woocommerce_store_city'             => 'London',
	'woocommerce_store_postcode'         => 'EC1A 1BB',
	'woocommerce_currency'               => 'GBP',
	'woocommerce_currency_pos'           => 'right_space',
	'woocommerce_price_decimal_sep'      => ',',
	'woocommerce_price_thousand_sep'     => '.',
	'woocommerce_price_num_decimals'     => '2',
	'woocommerce_calc_taxes'             => 'yes',
	'woocommerce_prices_include_tax'     => 'yes',
	'woocommerce_tax_based_on'           => 'base',
	'woocommerce_tax_display_shop'       => 'incl',
	'woocommerce_tax_display_cart'       => 'incl',
	'woocommerce_tax_round_at_subtotal'  => 'no',
	'woocommerce_tax_total_display'      => 'itemized',
	'woocommerce_manage_stock'           => 'yes',
	'woocommerce_enable_coupons'         => 'yes',
	'woocommerce_coming_soon'            => 'no',
	'woocommerce_store_pages_only'       => 'no',
	'woocommerce_allowed_countries'      => 'all',
	'woocommerce_onboarding_profile'     => array( 'skipped' => true ),
	'woocommerce_task_list_hidden'       => 'yes',
	'woocommerce_show_marketplace_suggestions' => 'no',
	'woocommerce_allow_tracking'         => 'no',
	'blog_public'                        => '0',
	'timezone_string'                    => 'Europe/London',
);
foreach ( $options as $name => $value ) {
	update_option( $name, $value );
}
WP_CLI::log( sprintf( 'settings: %d options set', count( $options ) ) );

// Make sure the default reduced/zero classes exist (WooCommerce creates them on
// a fresh install; this covers a store where someone removed them).
foreach ( array( 'Reduced rate', 'Zero rate' ) as $class_name ) {
	if ( ! in_array( sanitize_title( $class_name ), WC_Tax::get_tax_class_slugs(), true ) ) {
		WC_Tax::create_tax_class( $class_name );
		WP_CLI::log( "tax class: created {$class_name}" );
	}
}

global $wpdb;
$rates = array(
	// country, state, rate, name, priority, compound, shipping.
	array( 'GB', '', '20.0000', 'VAT', 1, 0, 1 ),
	array( 'GB', '', '2.0000', 'Surcharge', 2, 1, 1 ),
	array( 'US', 'AL', '4.0000', 'AL State', 1, 0, 1 ),
	array( 'US', 'AL', '5.0000', 'AL City', 3, 1, 0 ),
	array( 'US', 'AL', '1.0000', 'AL County', 2, 1, 0 ),
	array( 'AU', '', '10.0000', 'GST', 1, 0, 1 ),
);
foreach ( $rates as $order => list( $country, $state, $rate, $name, $priority, $compound, $shipping ) ) {
	$existing = $wpdb->get_var(
		$wpdb->prepare(
			"SELECT tax_rate_id FROM {$wpdb->prefix}woocommerce_tax_rates
			 WHERE tax_rate_country = %s AND tax_rate_state = %s AND tax_rate_name = %s AND tax_rate_class = ''",
			$country,
			$state,
			$name
		)
	);
	if ( $existing ) {
		continue;
	}
	$id = WC_Tax::_insert_tax_rate(
		array(
			'tax_rate_country'  => $country,
			'tax_rate_state'    => $state,
			'tax_rate'          => $rate,
			'tax_rate_name'     => $name,
			'tax_rate_priority' => $priority,
			'tax_rate_compound' => $compound,
			'tax_rate_shipping' => $shipping,
			'tax_rate_order'    => $order,
			'tax_rate_class'    => '',
		)
	);
	WP_CLI::log( sprintf( 'tax rate: #%d %s%s %s %s%% p%d%s', $id, $country, $state ? ":$state" : '', $name, $rate, $priority, $compound ? ' compound' : '' ) );
}
WC_Cache_Helper::get_transient_version( 'taxes', true );
