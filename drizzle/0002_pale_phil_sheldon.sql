CREATE TABLE "shares" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"title" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;