-- Manual revert for V7. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: drops the live images of all boards and their addresses; owners turn them on again with new addresses.

DROP TABLE board_embeds;

DELETE FROM flyway_schema_history WHERE version = '7';
