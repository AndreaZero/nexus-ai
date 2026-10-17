CREATE TABLE overview_read_cursor (
  project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
