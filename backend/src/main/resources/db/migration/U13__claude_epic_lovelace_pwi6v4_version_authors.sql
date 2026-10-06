-- Manual revert for V13. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the names and the authors of all versions and who changed the stored documents; they are not restored.
-- The versions and the documents stay.

DROP INDEX board_versions_authors_idx;

DROP INDEX board_documents_editors_idx;

ALTER TABLE board_versions DROP COLUMN name;

ALTER TABLE board_versions DROP COLUMN authors;

ALTER TABLE board_documents DROP COLUMN editors;

DELETE FROM flyway_schema_history WHERE version = '13';
