DROP INDEX "profiles_mc_name_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_mc_name_lower_uq" ON "profiles" USING btree (lower("minecraft_username")) WHERE minecraft_username is not null;