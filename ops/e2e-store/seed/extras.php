<?php
/**
 * Coupons and, when woocommerce-pos-pro is active, the three WCPOS stores.
 * Idempotent (coupons by code, stores by title).
 *
 *     wp eval-file /e2e-ops/seed/extras.php --user=1
 *
 * Store ids differ from dev-next's (578, 24128, 24129). Specs never hardcode
 * them: globalSetup lists the cashier's stores from the cashier API and writes
 * them to e2e/.auth-state/stores-pro.json.
 */

$coupons = array(
	array( 'code' => 'e2e-10-percent', 'type' => 'percent', 'amount' => '10' ),
	array( 'code' => 'e2e-5-off-cart', 'type' => 'fixed_cart', 'amount' => '5' ),
	array( 'code' => 'e2e-2-off-item', 'type' => 'fixed_product', 'amount' => '2' ),
);
foreach ( $coupons as $spec ) {
	if ( wc_get_coupon_id_by_code( $spec['code'] ) ) {
		continue;
	}
	$coupon = new WC_Coupon();
	$coupon->set_code( $spec['code'] );
	$coupon->set_discount_type( $spec['type'] );
	$coupon->set_amount( $spec['amount'] );
	$coupon->set_description( 'E2E store seed coupon' );
	$coupon->save();
	WP_CLI::log( "coupon: created {$spec['code']}" );
}

// Pro 2.x registers the wcpos_store post type (and the filters that list stores
// to the cashier API) only once its licence reads `activated`, so the post type
// is no test of whether Pro is active. Detect the plugin, then register the
// post type for this process if the licence gate skipped it.
$stores_service = 'WCPOS\WooCommercePOSPro\Services\Stores';
if ( ! class_exists( $stores_service ) ) {
	WP_CLI::log( 'stores: woocommerce-pos-pro not active; skipped (the free plugin has one implicit store)' );
	return;
}
if ( ! post_type_exists( 'wcpos_store' ) ) {
	$stores_service::instance();
}
$license = get_option( 'woocommerce_pos_pro_settings_license', array() );
if ( empty( $license['activated'] ) ) {
	WP_CLI::warning( 'stores: Pro licence not activated; the stores are created, but the cashier API lists only the default store until it is' );
}

// One store per tax regime settings.php creates, each taxing from its own address.
$stores = array(
	array(
		'title' => 'E2E Store London',
		'meta'  => array( '_address_1' => '1 E2E Street', '_city' => 'London', '_postcode' => 'EC1A 1BB', '_country' => 'GB', '_state' => '' ),
	),
	array(
		'title' => 'E2E Store Birmingham AL',
		'meta'  => array( '_address_1' => '1 E2E Avenue', '_city' => 'Birmingham', '_postcode' => '35203', '_country' => 'US', '_state' => 'AL' ),
	),
	array(
		'title' => 'E2E Store Sydney',
		'meta'  => array( '_address_1' => '1 E2E Road', '_city' => 'Sydney', '_postcode' => '2000', '_country' => 'AU', '_state' => 'NSW' ),
	),
);
foreach ( $stores as $store ) {
	$existing = get_posts(
		array(
			'post_type'   => 'wcpos_store',
			'post_status' => 'any',
			'title'       => $store['title'],
			'fields'      => 'ids',
			'numberposts' => 1,
		)
	);
	if ( $existing ) {
		continue;
	}
	$id = wp_insert_post(
		array(
			'post_type'   => 'wcpos_store',
			'post_status' => 'publish',
			'post_title'  => $store['title'],
		),
		true
	);
	if ( is_wp_error( $id ) ) {
		WP_CLI::error( "store {$store['title']}: " . $id->get_error_message() );
	}
	foreach ( $store['meta'] + array( '_tax_address' => 'store' ) as $key => $value ) {
		update_post_meta( $id, $key, $value );
	}
	WP_CLI::log( "store: created {$store['title']} (#$id)" );
}
$store_ids = get_posts(
	array(
		'post_type'   => 'wcpos_store',
		'post_status' => 'any',
		'fields'      => 'ids',
		'numberposts' => -1,
		'orderby'     => 'ID',
		'order'       => 'ASC',
	)
);
WP_CLI::log( sprintf( 'stores: %d (#%s)', count( $store_ids ), implode( ', #', $store_ids ) ) );
