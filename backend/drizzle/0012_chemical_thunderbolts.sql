ALTER TYPE "public"."notification_type" ADD VALUE 'reply';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'mention';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'repost';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'quote';--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookmarks_post_id_user_id_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "post_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"url" varchar(500) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"position" smallint NOT NULL,
	"alt" varchar(1000),
	CONSTRAINT "post_images_post_id_position_unique" UNIQUE("post_id","position"),
	CONSTRAINT "post_images_position_range" CHECK ("post_images"."position" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE "reposts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reposts_post_id_user_id_unique" UNIQUE("post_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "comment_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "quoted_post_id" uuid;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reposts" ADD CONSTRAINT "reposts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reposts_created_at_id_idx" ON "reposts" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "reposts_user_id_idx" ON "reposts" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_quoted_post_id_posts_id_fk" FOREIGN KEY ("quoted_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_quoted_post_id_idx" ON "posts" USING btree ("quoted_post_id");