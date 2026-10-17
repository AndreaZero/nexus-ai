CREATE TABLE project_realtime_cursor (
  project_id text PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
  sequence bigint NOT NULL DEFAULT 0 CHECK (sequence >= 0)
);
--> statement-breakpoint
CREATE TABLE live_share (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id),
  device_id text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  visibility text NOT NULL CHECK (visibility IN ('team', 'client')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'stopped')),
  messages jsonb NOT NULL CHECK (jsonb_typeof(messages) = 'array' AND jsonb_array_length(messages) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX live_share_project_idx ON live_share(project_id, updated_at);
--> statement-breakpoint
CREATE TABLE realtime_event (
  project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_id text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('session.changed', 'live.changed')),
  entity_id text NOT NULL,
  actor_id text NOT NULL REFERENCES "user"(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, sequence)
);
--> statement-breakpoint
CREATE TABLE realtime_upload (
  project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  batch_id text NOT NULL,
  author_id text NOT NULL REFERENCES "user"(id),
  share_id text NOT NULL REFERENCES live_share(id) ON DELETE CASCADE,
  payload_hash text NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id, batch_id)
);
