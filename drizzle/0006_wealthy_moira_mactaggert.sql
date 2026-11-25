CREATE TABLE "server_command_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" text NOT NULL,
	"actor" text NOT NULL,
	"actor_source" text DEFAULT 'ingame' NOT NULL,
	"command_type" text DEFAULT 'other' NOT NULL,
	"severity" text DEFAULT 'normal' NOT NULL,
	"summary" text NOT NULL,
	"raw_line" text DEFAULT '' NOT NULL,
	"log_time" text DEFAULT '' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "server_command_logs_fingerprint_uq" ON "server_command_logs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "server_command_logs_occurred_idx" ON "server_command_logs" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "server_command_logs_type_idx" ON "server_command_logs" USING btree ("command_type","occurred_at");--> statement-breakpoint
CREATE INDEX "server_command_logs_actor_idx" ON "server_command_logs" USING btree ("actor","occurred_at");