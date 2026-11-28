-- The route the party followed, as a GeoJSON MultiLineString with one line per recorded track. NULL when none was recorded.
-- Each line has two positions or more, and each position two numbers or more, as GeoJSON requires.
-- COALESCE because a missing key makes the test NULL, and a CHECK lets NULL through.
ALTER TABLE public.parties ADD COLUMN route_geojson JSONB
    CHECK (
        route_geojson IS NULL
        OR COALESCE(
            jsonb_typeof(route_geojson) = 'object'
            AND route_geojson->>'type' = 'MultiLineString'
            AND jsonb_typeof(route_geojson->'coordinates') = 'array'
            AND NOT jsonb_path_exists(route_geojson, 'strict $.coordinates[*] ? (@.type() != "array" || @.size() < 2)', '{}', TRUE)
            AND NOT jsonb_path_exists(route_geojson, 'strict $.coordinates[*][*] ? (@.type() != "array" || @.size() < 2)', '{}', TRUE)
            AND NOT jsonb_path_exists(route_geojson, 'strict $.coordinates[*][*][*] ? (@.type() != "number")', '{}', TRUE),
            FALSE
        )
    );
