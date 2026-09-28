CREATE TABLE "bag_clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"avg_distance" integer,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"website" text,
	"created_by" integer,
	"approved" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combinations" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"name" text NOT NULL,
	"first_loop_id" integer NOT NULL,
	"second_loop_id" integer NOT NULL,
	"si" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hole_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" integer NOT NULL,
	"number" integer NOT NULL,
	"par" integer NOT NULL,
	"si" integer NOT NULL,
	"length" integer,
	"strokes" integer,
	"points" integer,
	"putts" integer,
	"fairway" text,
	"gir" boolean,
	"penalties" integer DEFAULT 0 NOT NULL,
	"bunker" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holes" (
	"id" serial PRIMARY KEY NOT NULL,
	"loop_id" integer NOT NULL,
	"number" integer NOT NULL,
	"par" integer NOT NULL,
	"si" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"images" jsonb NOT NULL,
	"raw_output" jsonb,
	"draft" jsonb,
	"checks" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"round_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "loops" (
	"id" serial PRIMARY KEY NOT NULL,
	"club_id" integer NOT NULL,
	"name" text NOT NULL,
	"holes_count" integer DEFAULT 9 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"club_id" integer,
	"loop_id" integer,
	"combination_id" integer,
	"tee_id" integer,
	"course_label" text NOT NULL,
	"tee_label" text,
	"holes_count" integer NOT NULL,
	"format" text DEFAULT 'stableford' NOT NULL,
	"handicap_index" numeric(4, 1),
	"course_handicap" integer,
	"playing_handicap" integer,
	"course_rating" numeric(4, 1),
	"slope" integer,
	"par" integer NOT NULL,
	"pcc" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"qualifying" boolean DEFAULT true NOT NULL,
	"visibility" text DEFAULT 'default' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shots" (
	"id" serial PRIMARY KEY NOT NULL,
	"hole_score_id" integer NOT NULL,
	"seq" integer NOT NULL,
	"bag_club_id" integer,
	"lie" text NOT NULL,
	"distance" numeric(6, 1) NOT NULL,
	"penalty" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tees" (
	"id" serial PRIMARY KEY NOT NULL,
	"loop_id" integer,
	"combination_id" integer,
	"name" text NOT NULL,
	"gender" text DEFAULT 'm' NOT NULL,
	"course_rating" numeric(4, 1),
	"slope" integer,
	"par" integer NOT NULL,
	"lengths" jsonb NOT NULL,
	"valid_from" date DEFAULT '2000-01-01' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"gender" text DEFAULT 'm' NOT NULL,
	"official_index" numeric(4, 1),
	"start_index" numeric(4, 1),
	"allowance" integer DEFAULT 100 NOT NULL,
	"putt_unit" text DEFAULT 'm' NOT NULL,
	"sg_baseline" text DEFAULT 'scratch' NOT NULL,
	"sharing" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bag_clubs" ADD CONSTRAINT "bag_clubs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combinations" ADD CONSTRAINT "combinations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combinations" ADD CONSTRAINT "combinations_first_loop_id_loops_id_fk" FOREIGN KEY ("first_loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combinations" ADD CONSTRAINT "combinations_second_loop_id_loops_id_fk" FOREIGN KEY ("second_loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hole_scores" ADD CONSTRAINT "hole_scores_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holes" ADD CONSTRAINT "holes_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loops" ADD CONSTRAINT "loops_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_combination_id_combinations_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."combinations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tee_id_tees_id_fk" FOREIGN KEY ("tee_id") REFERENCES "public"."tees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_hole_score_id_hole_scores_id_fk" FOREIGN KEY ("hole_score_id") REFERENCES "public"."hole_scores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_bag_club_id_bag_clubs_id_fk" FOREIGN KEY ("bag_club_id") REFERENCES "public"."bag_clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tees" ADD CONSTRAINT "tees_loop_id_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tees" ADD CONSTRAINT "tees_combination_id_combinations_id_fk" FOREIGN KEY ("combination_id") REFERENCES "public"."combinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "hole_scores_round_number" ON "hole_scores" USING btree ("round_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "holes_loop_number" ON "holes" USING btree ("loop_id","number");--> statement-breakpoint
CREATE INDEX "loops_club_idx" ON "loops" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "rounds_user_date_idx" ON "rounds" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "shots_hole_idx" ON "shots" USING btree ("hole_score_id");--> statement-breakpoint
CREATE INDEX "tees_loop_idx" ON "tees" USING btree ("loop_id");--> statement-breakpoint
CREATE INDEX "tees_comb_idx" ON "tees" USING btree ("combination_id");