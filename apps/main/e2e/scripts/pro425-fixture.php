<?php
/**
 * Fixture for the pro#425 live store-pricing proof.
 *
 * Creates (idempotently) a product that is priced DIFFERENTLY per store, which
 * is the only shape that can distinguish "the till shows its own store's price"
 * from "the till shows the web store's price". A single-store fixture cannot:
 * it can't tell "wrote the right store" from "wrote the only store".
 *
 * Leaves at least one published store deliberately NOT opted in, so the
 * v1-parity case — a known store with no override still sees the global price —
 * is observable too.
 *
 * Run against a Pro dev server with at least two published stores:
 *
 *   docker exec <php-container> sh -lc \
 *     'wp eval-file /tmp/pro425-fixture.php --path=/var/www/html --allow-root'
 *
 * Prints the ids and prices as JSON. The spec reads nothing from here — it
 * derives its expectations from the live server — so the numbers below are a
 * convenience for humans, not a contract.
 */

$slug = getenv( 'PRO425_SLUG' ) ?: 'pro425probe';

$existing = get_posts(
	array(
		'post_type'   => 'product',
		'name'        => $slug,
		'post_status' => 'any',
		'numberposts' => 1,
	)
);

if ( $existing ) {
	$id = $existing[0]->ID;
} else {
	$product = new WC_Product_Simple();
	$product->set_name( $slug );
	$product->set_slug( $slug );
	$product->set_sku( $slug );
	$product->set_status( 'publish' );
	$product->set_catalog_visibility( 'visible' );
	$product->save();
	$id = $product->get_id();
}

$product = wc_get_product( $id );
$product->set_regular_price( '10.00' );
$product->set_sale_price( '' );
$product->set_manage_stock( false );
$product->save();

$stores = get_posts(
	array(
		'post_type'      => 'wcpos_store',
		'post_status'    => 'publish',
		'posts_per_page' => -1,
		'orderby'        => 'ID',
		'order'          => 'ASC',
		'fields'         => 'ids',
	)
);

if ( \count( $stores ) < 2 ) {
	echo wp_json_encode( array( 'error' => 'need at least two published wcpos_store posts', 'found' => \count( $stores ) ) ) . "\n";

	return;
}

// Price the first two stores apart; leave the rest unopted on purpose.
$prices  = array( '20.00', '30.00' );
$applied = array();
foreach ( array_slice( $stores, 0, 2 ) as $i => $store ) {
	$price = $prices[ $i ];
	update_post_meta( $id, "_pos_price_fields_store_{$store}", true );
	update_post_meta( $id, "_pos_regular_price_store_{$store}", $price );
	update_post_meta( $id, "_pos_sale_price_store_{$store}", '' );
	update_post_meta( $id, "_pos_price_store_{$store}", $price );
	$applied[ $store ] = $price;
}
foreach ( array_slice( $stores, 2 ) as $store ) {
	delete_post_meta( $id, "_pos_price_fields_store_{$store}" );
}

echo wp_json_encode(
	array(
		'product_id' => $id,
		'slug'       => $slug,
		'global'     => wc_get_product( $id )->get_regular_price(),
		'per_store'  => $applied,
		'unopted'    => array_values( array_slice( $stores, 2 ) ),
	)
) . "\n";
