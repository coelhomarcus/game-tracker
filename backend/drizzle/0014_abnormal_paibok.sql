ALTER TABLE "posts" ADD COLUMN "quoted_post_removed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "users_username_lower_idx" ON "users" USING btree (lower("username"));