ALTER TABLE "ai_session" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_session" ADD COLUMN "messages" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_version_check" CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "ai_session" ADD CONSTRAINT "ai_session_messages_check" CHECK (jsonb_typeof("messages") = 'array' AND jsonb_array_length("messages") <= 20);
