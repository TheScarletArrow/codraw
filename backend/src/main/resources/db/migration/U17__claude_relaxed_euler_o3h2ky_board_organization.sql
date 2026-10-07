-- Manual revert for V17. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the folders and tags of all users and the texts of boards for search; they are not restored. collab
-- computes the texts again once V17 is applied again.

DROP INDEX board_documents_without_search_text_idx;

ALTER TABLE board_documents DROP COLUMN search_text;

DROP INDEX board_placements_folder_id_idx;

DROP INDEX board_placements_board_id_idx;

DROP TABLE board_placements;

DROP INDEX board_tags_board_id_idx;

DROP INDEX board_tags_user_id_board_id_tag_idx;

DROP TABLE board_tags;

DROP INDEX board_folders_user_id_name_idx;

DROP TABLE board_folders;

DELETE FROM flyway_schema_history WHERE version = '17';
