<?php
// Code Snippets (PHP): don't run Debloat's unused-CSS removal on pages that are not cached
// (search results, 404, and requests WP Rocket marks as "do not optimize", e.g. ?nocache).
add_action( 'wp', function () {
    $uncached = is_search() || is_404() || ( defined( 'DONOTROCKETOPTIMIZE' ) && DONOTROCKETOPTIMIZE );
    if ( ! $uncached ) {
        return;
    }
    add_filter( 'debloat/should_process', '__return_false' );
    add_filter( 'debloat/should_optimize_css', '__return_false' );
} );
