CREATE TABLE "forum_poll_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"poll_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"option_id" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_polls" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"question" text NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ends_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"thread_id" integer NOT NULL,
	"content" text NOT NULL,
	"author" text NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT 'R' NOT NULL,
	"color" text DEFAULT 'avatar-2' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"liked_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forum_threads" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"author" text NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"avatar" text DEFAULT 'P' NOT NULL,
	"color" text DEFAULT 'avatar-1' NOT NULL,
	"category" text DEFAULT 'General' NOT NULL,
	"tag_class" text DEFAULT 'tag-accent' NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"last" text DEFAULT 'just now' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"liked_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edited_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gallery_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"content" text NOT NULL,
	"author" text NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gallery_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"builder" text DEFAULT 'Unknown' NOT NULL,
	"category" text DEFAULT 'Build' NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"image" text NOT NULL,
	"height" text DEFAULT 'medium' NOT NULL,
	"author_id" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"liked_by" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"avatar_url" text,
	"role" text DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"minecraft_username" text,
	"discord_verified" boolean DEFAULT false NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"created_at" text
);
--> statement-breakpoint
CREATE TABLE "rule_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"icon" text DEFAULT 'fa-handshake' NOT NULL,
	"title" text NOT NULL,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"title" text NOT NULL,
	"era" text DEFAULT 'Era I' NOT NULL,
	"major" boolean DEFAULT false NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "forum_poll_votes_poll_user_uq" ON "forum_poll_votes" USING btree ("poll_id","user_id");--> statement-breakpoint
CREATE INDEX "forum_polls_thread_id_idx" ON "forum_polls" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "forum_replies_thread_id_idx" ON "forum_replies" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "gallery_comments_item_id_idx" ON "gallery_comments" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_mc_name_uq" ON "profiles" USING btree ("minecraft_username") WHERE minecraft_username is not null;