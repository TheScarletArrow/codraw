-- Manual revert for V34. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- The leads of boards are lost; they stay members of the boards with their roles.

ALTER TABLE boards DROP CONSTRAINT boards_lead_fkey, DROP COLUMN lead_id;

DELETE FROM flyway_schema_history WHERE version = '34';
