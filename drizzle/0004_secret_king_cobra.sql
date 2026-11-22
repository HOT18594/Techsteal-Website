CREATE TABLE "launch_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"launch_at" timestamp with time zone DEFAULT '2026-11-22 18:00:00+00'::timestamptz NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_start" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"start_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
