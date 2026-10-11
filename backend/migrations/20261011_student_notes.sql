-- Additive migration. Apply once explicitly, after a verified backup, before deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE IF NOT EXISTS student_notes (
    id SERIAL PRIMARY KEY,
    author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    student_nick VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    CONSTRAINT ck_student_notes_text CHECK (length(trim(text)) > 0 AND length(text) <= 4000)
);
CREATE INDEX IF NOT EXISTS ix_student_notes_author_created ON student_notes(author_id, created_at, id);
CREATE INDEX IF NOT EXISTS ix_student_notes_student_id ON student_notes(student_id);
COMMIT;
