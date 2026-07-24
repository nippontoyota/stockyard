CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"role" text NOT NULL,
	"yard_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credentials_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "scans" ALTER COLUMN "yard_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "vehicle_status" ALTER COLUMN "current_yard_id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "yards" ALTER COLUMN "id" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "yards" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "flags" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "transfer_destination_yard_id" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "transfer_requested_by" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "damage_image" text;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_transfer_destination_yard_id_yards_id_fk" FOREIGN KEY ("transfer_destination_yard_id") REFERENCES "public"."yards"("id") ON DELETE no action ON UPDATE no action;