ALTER TABLE task ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE task ADD COLUMN source_session_id text REFERENCES ai_session(id) ON DELETE SET NULL;
ALTER TABLE milestone ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE milestone ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE milestone ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
CREATE TABLE project_document (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 title text NOT NULL, body text NOT NULL, visibility text NOT NULL CHECK(visibility IN ('team','client')),
 version integer NOT NULL DEFAULT 1 CHECK(version > 0), created_by text NOT NULL REFERENCES "user"(id),
 source_session_id text REFERENCES ai_session(id) ON DELETE SET NULL, task_id text REFERENCES task(id) ON DELETE SET NULL,
 document_id text REFERENCES project_document(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(char_length(title) BETWEEN 1 AND 300), CHECK(char_length(body) <= 65536)
);
CREATE INDEX project_document_project_idx ON project_document(project_id,created_at);
CREATE TABLE project_update (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 title text NOT NULL, body text NOT NULL, visibility text NOT NULL CHECK(visibility IN ('team','client')),
 version integer NOT NULL DEFAULT 1, created_by text NOT NULL REFERENCES "user"(id),
 source_session_id text REFERENCES ai_session(id) ON DELETE SET NULL, task_id text REFERENCES task(id) ON DELETE SET NULL,
 document_id text REFERENCES project_document(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(char_length(title) BETWEEN 1 AND 300), CHECK(char_length(body) <= 65536)
);
CREATE INDEX project_update_project_idx ON project_update(project_id,created_at);
--> statement-breakpoint
CREATE TABLE deliverable (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 title text NOT NULL, visibility text NOT NULL CHECK(visibility IN ('team','client')),
 version integer NOT NULL CHECK(version BETWEEN 1 AND 50), created_by text NOT NULL REFERENCES "user"(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','changes_requested')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX deliverable_project_idx ON deliverable(project_id,created_at);
CREATE TABLE deliverable_version (
 deliverable_id text NOT NULL REFERENCES deliverable(id) ON DELETE CASCADE, version integer NOT NULL CHECK(version BETWEEN 1 AND 50),
 title text NOT NULL, body text NOT NULL CHECK(char_length(body) <= 65536), visibility text NOT NULL CHECK(visibility IN ('team','client')),
 created_by text NOT NULL REFERENCES "user"(id), source_session_id text REFERENCES ai_session(id) ON DELETE SET NULL,
 task_id text REFERENCES task(id) ON DELETE SET NULL, document_id text REFERENCES project_document(id) ON DELETE SET NULL,
 attachment_ids jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(),
 decision text CHECK(decision IN ('approved','changes_requested')), decided_by text REFERENCES "user"(id),
 decision_body text NOT NULL DEFAULT '' CHECK(char_length(decision_body) <= 4000), decided_at timestamptz,
 PRIMARY KEY(deliverable_id,version), CHECK(jsonb_typeof(attachment_ids)='array' AND jsonb_array_length(attachment_ids)<=5)
);
--> statement-breakpoint
CREATE TABLE client_feedback (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 target_kind text NOT NULL CHECK(target_kind IN ('project','document','update','deliverable')), target_id text,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000), sentiment text CHECK(sentiment IN ('positive','neutral','negative')),
 created_by text NOT NULL REFERENCES "user"(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_feedback_project_idx ON client_feedback(project_id,created_at);
CREATE TABLE work_comment (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 target_kind text NOT NULL CHECK(target_kind IN ('task','milestone','document','update','deliverable','feedback')), target_id text NOT NULL,
 body text NOT NULL CHECK(char_length(body) BETWEEN 1 AND 4000), created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_comment_target_idx ON work_comment(project_id,target_kind,target_id,created_at);
--> statement-breakpoint
CREATE TABLE work_attachment (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE, created_by text NOT NULL REFERENCES "user"(id),
 name text NOT NULL, mime text NOT NULL, size integer NOT NULL CHECK(size BETWEEN 1 AND 1048576),
 sha256 text NOT NULL, base64 text NOT NULL CHECK(char_length(base64)<=1398104), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_attachment_project_idx ON work_attachment(project_id);
CREATE TABLE work_receipt (
 project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE, actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id text NOT NULL, payload_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,actor_id,request_id)
);
CREATE TABLE work_change (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 target_kind text NOT NULL CHECK(target_kind IN ('task','milestone','document','update','deliverable','feedback','comment')), target_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_change_target_idx ON work_change(project_id,target_kind,target_id);
ALTER TABLE realtime_event DROP CONSTRAINT realtime_event_kind_check;
ALTER TABLE realtime_event ADD CONSTRAINT realtime_event_kind_check CHECK(kind IN ('session.changed','live.changed','work.changed'));
