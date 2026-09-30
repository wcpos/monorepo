<?php
/**
 * One-line-per-fact summary of what the store holds, for seed.sh's output.
 *
 *     wp eval-file /e2e-ops/seed/summary.php
 */

require_once ABSPATH . 'wp-admin/includes/plugin.php';
global $wpdb;

$count_posts = static function ( $type ) {
	$counts = wp_count_posts( $type );
	return (int) ( $counts->publish ?? 0 );
};
$role_count = static function ( $role ) {
	return count( get_users( array( 'role' => $role, 'fields' => 'ID' ) ) );
};
$rates = $wpdb->get_results(
	"SELECT tax_rate_country c, tax_rate_state s, tax_rate r, tax_rate_name n, tax_rate_priority p,
	        tax_rate_compound x, tax_rate_class k
	 FROM {$wpdb->prefix}woocommerce_tax_rates ORDER BY tax_rate_country, tax_rate_class, tax_rate_priority"
);
$stock = $wpdb->get_results(
	"SELECT pm.meta_value status, COUNT(*) n FROM {$wpdb->postmeta} pm
	 JOIN {$wpdb->posts} p ON p.ID = pm.post_id AND p.post_type = 'product' AND p.post_status = 'publish'
	 WHERE pm.meta_key = '_stock_status' GROUP BY pm.meta_value"
);
$types = array();
foreach ( array( 'simple', 'variable', 'grouped', 'external' ) as $type ) {
	$types[] = $type . '=' . count( wc_get_products( array( 'type' => $type, 'limit' => -1, 'return' => 'ids' ) ) );
}

WP_CLI::line( 'products: ' . $count_posts( 'product' ) . ' (' . implode( ' ', $types ) . ')' );
WP_CLI::line( 'variations: ' . $count_posts( 'product_variation' ) );
WP_CLI::line( 'stock: ' . implode( ' ', array_map( static fn( $row ) => "{$row->status}={$row->n}", $stock ) ) );
WP_CLI::line( 'categories: ' . wp_count_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) ) );
WP_CLI::line( 'tags: ' . wp_count_terms( array( 'taxonomy' => 'product_tag', 'hide_empty' => false ) ) );
WP_CLI::line( 'coupons: ' . $count_posts( 'shop_coupon' ) );
WP_CLI::line( 'users: cashier=' . $role_count( 'cashier' ) . ' shop_manager=' . $role_count( 'shop_manager' ) . ' administrator=' . $role_count( 'administrator' ) . ' customer=' . $role_count( 'customer' ) );
WP_CLI::line( 'wcpos stores: ' . ( post_type_exists( 'wcpos_store' ) ? $count_posts( 'wcpos_store' ) : 'n/a (free)' ) );
WP_CLI::line( 'plugins: ' . implode( ' ', array_map( static fn( $file ) => dirname( $file ) . '@' . get_plugin_data( WP_PLUGIN_DIR . '/' . $file, false, false )['Version'], get_option( 'active_plugins' ) ) ) );
WP_CLI::line( sprintf( 'currency: %s, prices include tax: %s, tax based on: %s', get_option( 'woocommerce_currency' ), get_option( 'woocommerce_prices_include_tax' ), get_option( 'woocommerce_tax_based_on' ) ) );
foreach ( $rates as $rate ) {
	WP_CLI::line( sprintf( 'tax rate: %s%s %s %s%% p%d%s class=%s', $rate->c ?: '*', $rate->s ? ":{$rate->s}" : '', $rate->n, rtrim( rtrim( $rate->r, '0' ), '.' ), $rate->p, $rate->x ? ' compound' : '', $rate->k ?: 'standard' ) );
}
