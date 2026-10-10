-- Deleting a user sets resolved_by of the threads they resolved to NULL: the only foreign key to users without an index
-- that starts with it, which made that read all threads.
CREATE INDEX comment_threads_resolved_by_idx ON comment_threads (resolved_by);
