-- A thread may stand at a point of its page instead of on an element: x and y in the coordinates of the diagram of the
-- page, like the shapes. A thread is about an element, about a point or about the whole page, never two of them.
ALTER TABLE comment_threads
    ADD COLUMN x double precision,
    ADD COLUMN y double precision,
    ADD CONSTRAINT comment_threads_point_check CHECK ((x IS NULL) = (y IS NULL)),
    ADD CONSTRAINT comment_threads_point_cell_id_check CHECK (x IS NULL OR cell_id IS NULL),
    -- Also keeps out NaN and the infinities, which double precision takes otherwise.
    ADD CONSTRAINT comment_threads_point_range_check
        CHECK (x BETWEEN -1000000 AND 1000000 AND y BETWEEN -1000000 AND 1000000);
