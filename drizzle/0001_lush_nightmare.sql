CREATE TABLE "settings" (
	"owner_id" text DEFAULT 'owner' NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_owner_id_key_pk" PRIMARY KEY("owner_id","key")
);
