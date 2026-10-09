-- Manual revert for V25. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: forgets the connections of all users to the issue tracker with their tokens, and every issue linked to
-- elements and threads; they are not restored. The issues themselves stay in the tracker.

DROP INDEX issue_creations_link_id_idx;

DROP TABLE issue_creations;

DROP INDEX issue_links_linked_by_idx;

DROP INDEX issue_links_thread_id_idx;

DROP INDEX issue_links_tracker_external_id_idx;

DROP TABLE issue_links;

DROP TABLE issue_tracker_connections;

DELETE FROM flyway_schema_history WHERE version = '25';
