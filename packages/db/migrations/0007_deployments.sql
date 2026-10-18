CREATE TABLE deployment_environment (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 100),kind text NOT NULL CHECK(kind IN ('development','staging','production')),
 visibility text NOT NULL CHECK(visibility IN ('team','client')),preview_url text,required_checks jsonb NOT NULL DEFAULT '[]',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL REFERENCES "user"(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE project_deployment (
 id text PRIMARY KEY,project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 environment_id text NOT NULL REFERENCES deployment_environment(id) ON DELETE CASCADE,
 title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 200),status text NOT NULL CHECK(status IN ('queued','building','succeeded','failed','cancelled')),
 commit_sha text,branch text,build_url text,preview_url text,notes text NOT NULL DEFAULT '',thumbnail text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL REFERENCES "user"(id),observed_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX project_deployment_project_idx ON project_deployment(project_id,observed_at,id);
CREATE TABLE health_observation (
 id text PRIMARY KEY,project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,
 environment_id text NOT NULL REFERENCES deployment_environment(id) ON DELETE CASCADE,
 check_name text NOT NULL CHECK(check_name IN ('build','tests','coverage','performance','security')),status text NOT NULL CHECK(status IN ('pass','warn','fail')),
 value double precision,unit text,summary text NOT NULL DEFAULT '',source_url text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),created_by text NOT NULL REFERENCES "user"(id),observed_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(environment_id,check_name)
);
CREATE TABLE deployment_receipt (
 project_id text NOT NULL REFERENCES project(id) ON DELETE CASCADE,actor_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 request_id text NOT NULL,payload_hash text NOT NULL,response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,actor_id,request_id)
);
--> statement-breakpoint
ALTER TABLE realtime_event DROP CONSTRAINT realtime_event_kind_check;
ALTER TABLE realtime_event ADD CONSTRAINT realtime_event_kind_check CHECK(kind IN ('session.changed','live.changed','work.changed','repository.changed','deployment.changed'));
