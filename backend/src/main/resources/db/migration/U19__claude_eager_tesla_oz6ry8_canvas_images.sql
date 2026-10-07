-- Manual revert for V19. Flyway Community does not run U-files automatically:
-- `flyway undo` is a Teams/Enterprise feature, so review and run this script by hand.
-- WARNING: forgets all images of boards; their objects stay in the storage, and the boards show placeholders where the
-- images were. Empty the bucket (codraw-images) by hand to free its space.

DROP TABLE board_images;

DELETE FROM flyway_schema_history WHERE version = '19';
