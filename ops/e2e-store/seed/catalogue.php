<?php
/**
 * Rebuild dev-next's catalogue shape from the Store API export that
 * fetch-catalogue.sh wrote to /e2e-catalogue. Idempotent: every seeded record
 * carries `_e2e_source_id` (its dev-next id) and is skipped when present.
 *
 *     wp eval-file /e2e-ops/seed/catalogue.php --user=1
 *
 * Copied: categories (with hierarchy), tags, simple / variable / grouped /
 * external products, SKUs, regular and sale prices, stock status and managed
 * quantities, local and global attributes, and every variation.
 * Not copied: dev-next's E2E probe leftovers (names below), real images (each
 * imaged product gets local placeholder PNGs instead), reviews, brands.
 */

ini_set( 'memory_limit', '1024M' );
require_once ABSPATH . 'wp-admin/includes/image.php';

const E2E_SOURCE_META  = '_e2e_source_id';
const E2E_PLACEHOLDERS = 8;
// Past runs' probe records on dev-next; unique per run, never catalogue.
const E2E_PROBE_NAME_PATTERN = '/^E2E |zx[a-z0-9]{8,}|probe/i';

$dir        = '/e2e-catalogue';
$products   = json_decode( file_get_contents( "$dir/products.json" ), true );
$variations = json_decode( file_get_contents( "$dir/variations.json" ), true );
$categories = json_decode( file_get_contents( "$dir/categories.json" ), true );
if ( ! is_array( $products ) || ! is_array( $variations ) || ! is_array( $categories ) ) {
	WP_CLI::error( 'catalogue export missing or unreadable; run fetch-catalogue.sh first' );
}
$variations_by_id = array();
foreach ( $variations as $variation ) {
	$variations_by_id[ $variation['id'] ] = $variation;
}

wp_defer_term_counting( true );

function e2e_text( $value ) {
	return html_entity_decode( (string) $value, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
}

/** Store API prices are integer minor units. */
function e2e_money( $minor, $minor_unit ) {
	if ( '' === $minor || null === $minor ) {
		return '';
	}
	return wc_format_decimal( (int) $minor / pow( 10, (int) $minor_unit ), (int) $minor_unit );
}

function e2e_find_by_source( $source_id, $post_type ) {
	$ids = get_posts(
		array(
			'post_type'   => $post_type,
			'post_status' => 'any',
			'meta_key'    => E2E_SOURCE_META,
			'meta_value'  => (string) $source_id,
			'fields'      => 'ids',
			'numberposts' => 1,
		)
	);
	return $ids ? (int) $ids[0] : 0;
}

/** A solid-colour PNG, built without GD so the CLI image needs no extension. */
function e2e_png( $size, $rgb ) {
	$row = "\0" . str_repeat( pack( 'C3', $rgb[0], $rgb[1], $rgb[2] ), $size );
	$raw = str_repeat( $row, $size );
	$chunk = static function ( $type, $data ) {
		return pack( 'N', strlen( $data ) ) . $type . $data . pack( 'N', crc32( $type . $data ) );
	};
	return "\x89PNG\r\n\x1a\n"
		. $chunk( 'IHDR', pack( 'NNC5', $size, $size, 8, 2, 0, 0, 0 ) )
		. $chunk( 'IDAT', gzcompress( $raw ) )
		. $chunk( 'IEND', '' );
}

// 1. Placeholder images.
$placeholders = array();
$palette      = array( array( 214, 69, 65 ), array( 52, 120, 198 ), array( 60, 160, 90 ), array( 230, 160, 40 ), array( 120, 80, 170 ), array( 40, 170, 170 ), array( 200, 90, 150 ), array( 110, 110, 110 ) );
for ( $i = 0; $i < E2E_PLACEHOLDERS; $i++ ) {
	$existing = get_posts(
		array(
			'post_type'   => 'attachment',
			'post_status' => 'inherit',
			'meta_key'    => '_e2e_placeholder',
			'meta_value'  => (string) $i,
			'fields'      => 'ids',
			'numberposts' => 1,
		)
	);
	if ( $existing ) {
		$placeholders[] = (int) $existing[0];
		continue;
	}
	$upload = wp_upload_bits( "e2e-placeholder-$i.png", null, e2e_png( 300, $palette[ $i ] ) );
	if ( ! empty( $upload['error'] ) ) {
		WP_CLI::error( "placeholder upload failed: {$upload['error']}" );
	}
	$attachment_id = wp_insert_attachment(
		array(
			'post_mime_type' => 'image/png',
			'post_title'     => "E2E placeholder $i",
			'post_status'    => 'inherit',
		),
		$upload['file']
	);
	wp_update_attachment_metadata( $attachment_id, wp_generate_attachment_metadata( $attachment_id, $upload['file'] ) );
	update_post_meta( $attachment_id, '_e2e_placeholder', (string) $i );
	$placeholders[] = $attachment_id;
}
WP_CLI::log( sprintf( 'images: %d placeholders', count( $placeholders ) ) );

// 2. Categories, parents before children.
$term_by_source = array();
$pending        = $categories;
for ( $pass = 0; $pending && $pass < 10; $pass++ ) {
	$next = array();
	foreach ( $pending as $category ) {
		$parent = (int) $category['parent'];
		if ( $parent && ! isset( $term_by_source[ $parent ] ) ) {
			$next[] = $category;
			continue;
		}
		$term = get_term_by( 'slug', $category['slug'], 'product_cat' );
		if ( ! $term ) {
			$created = wp_insert_term(
				e2e_text( $category['name'] ),
				'product_cat',
				array(
					'slug'        => $category['slug'],
					'parent'      => $parent ? $term_by_source[ $parent ] : 0,
					'description' => e2e_text( $category['description'] ?? '' ),
				)
			);
			if ( is_wp_error( $created ) ) {
				WP_CLI::warning( "category {$category['slug']}: " . $created->get_error_message() );
				continue;
			}
			$term_id = (int) $created['term_id'];
		} else {
			$term_id = (int) $term->term_id;
		}
		$term_by_source[ (int) $category['id'] ] = $term_id;
	}
	$pending = $next;
}
WP_CLI::log( sprintf( 'categories: %d mapped', count( $term_by_source ) ) );

function e2e_term_ids( $terms, $taxonomy ) {
	$ids = array();
	foreach ( $terms as $term ) {
		$existing = get_term_by( 'slug', $term['slug'], $taxonomy );
		if ( ! $existing ) {
			$created = wp_insert_term( e2e_text( $term['name'] ), $taxonomy, array( 'slug' => $term['slug'] ) );
			if ( is_wp_error( $created ) ) {
				continue;
			}
			$ids[] = (int) $created['term_id'];
		} else {
			$ids[] = (int) $existing->term_id;
		}
	}
	return $ids;
}

/** Ensure a global attribute (pa_*) and its terms exist; returns attribute id. */
function e2e_global_attribute( $attribute ) {
	$slug = preg_replace( '/^pa_/', '', $attribute['taxonomy'] );
	$id   = wc_attribute_taxonomy_id_by_name( $slug );
	if ( ! $id ) {
		$id = wc_create_attribute( array( 'name' => e2e_text( $attribute['name'] ), 'slug' => $slug ) );
		if ( is_wp_error( $id ) ) {
			WP_CLI::error( "attribute $slug: " . $id->get_error_message() );
		}
		register_taxonomy( $attribute['taxonomy'], array( 'product' ) );
	}
	return (int) $id;
}

/** Stock: dev-next reports managed quantities only at or below the low-stock line. */
function e2e_apply_stock( $product, $source, $default_managed_qty = null ) {
	if ( null !== $source['low_stock_remaining'] ) {
		$product->set_manage_stock( true );
		$product->set_stock_quantity( (int) $source['low_stock_remaining'] );
	} elseif ( null !== $default_managed_qty && $source['is_in_stock'] ) {
		$product->set_manage_stock( true );
		$product->set_stock_quantity( $default_managed_qty );
	} else {
		$product->set_manage_stock( false );
		$product->set_stock_status( $source['is_in_stock'] ? 'instock' : 'outofstock' );
	}
}

function e2e_apply_prices( $product, $source ) {
	$prices  = $source['prices'];
	$unit    = $prices['currency_minor_unit'];
	$regular = e2e_money( $prices['regular_price'], $unit );
	$sale    = e2e_money( $prices['sale_price'], $unit );
	$product->set_regular_price( $regular );
	$product->set_sale_price( ! empty( $source['on_sale'] ) && $sale !== $regular ? $sale : '' );
}

function e2e_images( $product, $source, $placeholders, $index ) {
	$count = count( $source['images'] ?? array() );
	if ( ! $count ) {
		return;
	}
	$product->set_image_id( $placeholders[ $index % count( $placeholders ) ] );
	$gallery = array();
	for ( $i = 1; $i < min( $count, count( $placeholders ) ); $i++ ) {
		$gallery[] = $placeholders[ ( $index + $i ) % count( $placeholders ) ];
	}
	$product->set_gallery_image_ids( $gallery );
}

function e2e_set_sku( $product, $sku ) {
	if ( '' === (string) $sku || wc_get_product_id_by_sku( $sku ) ) {
		return;
	}
	try {
		$product->set_sku( $sku );
	} catch ( WC_Data_Exception $e ) {
		WP_CLI::warning( "sku $sku: " . $e->getMessage() );
	}
}

// 3. Products. Grouped products last, so their children already exist.
usort(
	$products,
	static function ( $a, $b ) {
		return ( 'grouped' === $a['type'] ) <=> ( 'grouped' === $b['type'] );
	}
);
$product_by_source = array();
$counts            = array( 'created' => 0, 'present' => 0, 'probes' => 0, 'variations' => 0 );
foreach ( $products as $index => $source ) {
	$name = e2e_text( $source['name'] );
	if ( preg_match( E2E_PROBE_NAME_PATTERN, $name ) ) {
		++$counts['probes'];
		continue;
	}
	$existing = e2e_find_by_source( $source['id'], 'product' );
	if ( $existing ) {
		$product_by_source[ $source['id'] ] = $existing;
		++$counts['present'];
		continue;
	}

	switch ( $source['type'] ) {
		case 'variable':
			$product = new WC_Product_Variable();
			break;
		case 'grouped':
			$product = new WC_Product_Grouped();
			break;
		case 'external':
			$product = new WC_Product_External();
			$product->set_product_url( $source['add_to_cart']['url'] ?? '' );
			$product->set_button_text( e2e_text( $source['add_to_cart']['text'] ?? '' ) );
			break;
		default:
			$product = new WC_Product_Simple();
	}
	$product->set_name( $name );
	$product->set_status( 'publish' );
	$product->set_description( $source['description'] ?? '' );
	$product->set_short_description( $source['short_description'] ?? '' );
	e2e_set_sku( $product, $source['sku'] );
	$category_ids = array();
	foreach ( $source['categories'] as $category ) {
		if ( isset( $term_by_source[ (int) $category['id'] ] ) ) {
			$category_ids[] = $term_by_source[ (int) $category['id'] ];
		}
	}
	$product->set_category_ids( $category_ids );
	$product->set_tag_ids( e2e_term_ids( $source['tags'], 'product_tag' ) );
	e2e_images( $product, $source, $placeholders, $index );

	if ( 'variable' === $source['type'] ) {
		$attributes = array();
		foreach ( $source['attributes'] as $position => $attribute ) {
			$wc_attribute = new WC_Product_Attribute();
			if ( ! empty( $attribute['taxonomy'] ) ) {
				$wc_attribute->set_id( e2e_global_attribute( $attribute ) );
				$wc_attribute->set_name( $attribute['taxonomy'] );
				$wc_attribute->set_options( e2e_term_ids( $attribute['terms'], $attribute['taxonomy'] ) );
			} else {
				$wc_attribute->set_name( e2e_text( $attribute['name'] ) );
				$wc_attribute->set_options( array_map( 'e2e_text', wp_list_pluck( $attribute['terms'], 'name' ) ) );
			}
			$wc_attribute->set_position( $position );
			$wc_attribute->set_visible( true );
			$wc_attribute->set_variation( ! empty( $attribute['has_variations'] ) );
			$attributes[] = $wc_attribute;
		}
		$product->set_attributes( $attributes );
		e2e_apply_stock( $product, $source );
	} elseif ( 'grouped' === $source['type'] ) {
		$children = array();
		foreach ( $source['grouped_products'] as $child ) {
			if ( isset( $product_by_source[ $child ] ) ) {
				$children[] = $product_by_source[ $child ];
			}
		}
		$product->set_children( $children );
	} else {
		e2e_apply_prices( $product, $source );
		e2e_apply_stock( $product, $source );
	}
	$product->update_meta_data( E2E_SOURCE_META, (string) $source['id'] );
	$product_id                          = $product->save();
	$product_by_source[ $source['id'] ] = $product_id;
	++$counts['created'];

	if ( 'variable' === $source['type'] ) {
		// Variation attribute values name the parent's attribute by its label.
		$taxonomy_by_label = array();
		foreach ( $source['attributes'] as $attribute ) {
			$taxonomy_by_label[ e2e_text( $attribute['name'] ) ] = $attribute['taxonomy'] ?? '';
		}
		foreach ( $source['variations'] as $ref ) {
			$variation_source = $variations_by_id[ $ref['id'] ] ?? null;
			if ( ! $variation_source ) {
				continue;
			}
			$variation = new WC_Product_Variation();
			$variation->set_parent_id( $product_id );
			$variation->set_status( 'publish' );
			$values = array();
			foreach ( $ref['attributes'] as $pair ) {
				$label    = e2e_text( $pair['name'] );
				$taxonomy = $taxonomy_by_label[ $label ] ?? '';
				if ( $taxonomy ) {
					$values[ $taxonomy ] = $pair['value'];
				} else {
					$values[ sanitize_title( $label ) ] = e2e_text( $pair['value'] );
				}
			}
			$variation->set_attributes( $values );
			e2e_set_sku( $variation, $variation_source['sku'] );
			e2e_apply_prices( $variation, $variation_source );
			// dev-next's in-stock variations manage stock above the low-stock line.
			e2e_apply_stock( $variation, $variation_source, 100 );
			$variation->update_meta_data( E2E_SOURCE_META, (string) $variation_source['id'] );
			$variation->save();
			++$counts['variations'];
		}
		WC_Product_Variable::sync( $product_id );
	}

	if ( 0 === $counts['created'] % 25 ) {
		wp_cache_flush();
		WP_CLI::log( sprintf( 'products: %d created so far', $counts['created'] ) );
	}
}

wp_defer_term_counting( false );
WP_CLI::success(
	sprintf(
		'catalogue: %d products created, %d already present, %d variations created, %d dev-next probe leftovers skipped',
		$counts['created'],
		$counts['present'],
		$counts['variations'],
		$counts['probes']
	)
);
