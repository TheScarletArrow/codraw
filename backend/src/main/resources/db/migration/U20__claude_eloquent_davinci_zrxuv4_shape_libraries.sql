-- Manual revert for V20. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: deletes the libraries of shapes of all users with their components; they are not restored. Copies of
-- components on boards stay.

DROP INDEX library_components_library_id_idx;

DROP TABLE library_components;

DROP INDEX shape_libraries_user_id_idx;

DROP TABLE shape_libraries;

DELETE FROM flyway_schema_history WHERE version = '20';
