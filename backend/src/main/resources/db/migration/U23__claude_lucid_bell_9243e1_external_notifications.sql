-- Manual revert for V23. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: forgets the email addresses and the webhooks of all users, whether they confirmed them, the boards they
-- muted and the messages not sent yet; they are not restored. Notifications in the app stay.

DROP INDEX notification_deliveries_channel_id_idx;

DROP INDEX notification_deliveries_next_attempt_at_idx;

DROP TABLE notification_deliveries;

DROP INDEX notification_board_mutes_board_id_idx;

DROP TABLE notification_board_mutes;

DROP TABLE notification_channels;

DELETE FROM flyway_schema_history WHERE version = '23';
