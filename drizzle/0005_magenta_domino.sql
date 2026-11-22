ALTER TABLE "announcements" ADD COLUMN "pattern" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "accent_color" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "icon" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "vibrant" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "link_label" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN "link_href" text DEFAULT '' NOT NULL;