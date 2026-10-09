-- Architecture decisions of boards (ADR) in the format of MADR: a number of its own on the board, a title, a status, the
-- day it was decided on and its author, the context, the options considered, the outcome and its consequences. A
-- decision that another one supersedes names it. Decisions outlive the elements and versions of the board and go with
-- the board. A decision of a user who is gone stays, without its author.
CREATE TABLE decisions (
    id            uuid        PRIMARY KEY DEFAULT uuidv7(),
    board_id      uuid        NOT NULL REFERENCES boards (id) ON DELETE CASCADE,
    number        integer     NOT NULL CHECK (number BETWEEN 1 AND 99999),
    title         text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    status        text        NOT NULL CHECK (status IN ('PROPOSED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
    superseded_by uuid        REFERENCES decisions (id) ON DELETE SET NULL,
    decided_on    date        NOT NULL,
    author_id     uuid        REFERENCES users (id) ON DELETE SET NULL,
    context       text        NOT NULL CHECK (char_length(context) <= 20000),
    options       text        NOT NULL CHECK (char_length(options) <= 20000),
    outcome       text        NOT NULL CHECK (char_length(outcome) <= 20000),
    consequences  text        NOT NULL CHECK (char_length(consequences) <= 20000),
    created_at    timestamptz NOT NULL,
    updated_at    timestamptz NOT NULL,
    UNIQUE (board_id, number),
    CHECK (superseded_by IS NULL OR status = 'SUPERSEDED')
);

CREATE INDEX decisions_author_id_idx ON decisions (author_id);
CREATE INDEX decisions_superseded_by_idx ON decisions (superseded_by);

-- The elements a decision is about: cells of pages of the board document, which may be deleted since, like the element
-- of a thread of comments.
CREATE TABLE decision_elements (
    decision_id uuid NOT NULL REFERENCES decisions (id) ON DELETE CASCADE,
    page_id     text NOT NULL CHECK (char_length(page_id) BETWEEN 1 AND 100),
    cell_id     text NOT NULL CHECK (char_length(cell_id) BETWEEN 1 AND 100),
    PRIMARY KEY (decision_id, page_id, cell_id)
);

-- The discussion of a decision is a thread of comments about it; it goes with the decision.
ALTER TABLE comment_threads ADD COLUMN decision_id uuid REFERENCES decisions (id) ON DELETE CASCADE;

CREATE INDEX comment_threads_decision_id_idx ON comment_threads (decision_id);
