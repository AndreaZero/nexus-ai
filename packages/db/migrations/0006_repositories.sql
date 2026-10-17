CREATE TABLE repository_connection (
 repository_id text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 token_cipher text NOT NULL, login text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repository_id,user_id)
);
CREATE TABLE repository_sync (
 repository_id text PRIMARY KEY REFERENCES repository(id) ON DELETE CASCADE,
 remote_url text NOT NULL, snapshot jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE repository_webhook (
 repository_id text PRIMARY KEY REFERENCES repository(id) ON DELETE CASCADE,
 secret_cipher text NOT NULL, configured_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE repository_delivery (
 repository_id text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
 delivery_id text NOT NULL, payload_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(repository_id,delivery_id)
);
CREATE TABLE repository_receipt (
 repository_id text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
 actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id text NOT NULL, payload_hash text NOT NULL, response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(repository_id,actor_id,request_id)
);
CREATE TABLE repository_activity (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 repository_id text NOT NULL REFERENCES repository(id) ON DELETE CASCADE,
 actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 kind text NOT NULL CHECK(kind IN ('commit','pull','review')), title text NOT NULL CHECK(char_length(title)<=500),
 url text NOT NULL, sha text, pull_number integer CHECK(pull_number>0), external_key text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(repository_id,external_key)
);
CREATE INDEX repository_activity_project_idx ON repository_activity(project_id,occurred_at);
--> statement-breakpoint
ALTER TABLE realtime_event DROP CONSTRAINT realtime_event_kind_check;
ALTER TABLE realtime_event ADD CONSTRAINT realtime_event_kind_check CHECK(kind IN ('session.changed','live.changed','work.changed','repository.changed'));
