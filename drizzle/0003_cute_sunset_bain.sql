CREATE TABLE "announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"tone" text DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "announcements_active_created_idx" ON "announcements" USING btree ("active","created_at");