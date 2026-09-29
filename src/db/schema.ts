import {
  pgTable,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------- Gebruikers en toegang ----------

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** owner = eigenaar/admin, player = speler, viewer = flightgenoot (alleen lezen) */
  role: text("role").notNull().default("player"),
  gender: text("gender").notNull().default("m"),
  /** Officiële NGF-index, alleen ter vergelijking */
  officialIndex: numeric("official_index", { precision: 4, scale: 1 }),
  /** Startindex als er nog te weinig qualifying rondes zijn */
  startIndex: numeric("start_index", { precision: 4, scale: 1 }),
  /** Handicap-allowance in procenten (standaard 100) */
  allowance: integer("allowance").notNull().default(100),
  puttUnit: text("putt_unit").notNull().default("m"),
  /** Referentieniveau strokes gained: tour, scratch, hcp10, hcp20, hcp30 */
  sgBaseline: text("sg_baseline").notNull().default("scratch"),
  /** private | friends */
  sharing: text("sharing").notNull().default("private"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const invites = pgTable("invites", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("player"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

// ---------- Banen (gedeeld) ----------

export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city"),
  website: text("website"),
  createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
  /** Later: voorgestelde banen van spelers, goed te keuren door de eigenaar */
  approved: boolean("approved").notNull().default(true),
});

export const loops = pgTable(
  "loops",
  {
    id: serial("id").primaryKey(),
    clubId: integer("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    holesCount: integer("holes_count").notNull().default(9),
  },
  (t) => [index("loops_club_idx").on(t.clubId)],
);

export const holes = pgTable(
  "holes",
  {
    id: serial("id").primaryKey(),
    loopId: integer("loop_id")
      .notNull()
      .references(() => loops.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    par: integer("par").notNull(),
    /** Stroke index binnen de lus (9-holesvariant) */
    si: integer("si").notNull(),
  },
  (t) => [uniqueIndex("holes_loop_number").on(t.loopId, t.number)],
);

export const combinations = pgTable("combinations", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  firstLoopId: integer("first_loop_id")
    .notNull()
    .references(() => loops.id, { onDelete: "cascade" }),
  secondLoopId: integer("second_loop_id")
    .notNull()
    .references(() => loops.id, { onDelete: "cascade" }),
  /** Stroke index per hole (18 waarden) voor deze combinatie */
  si: jsonb("si").$type<number[]>().notNull(),
});

export const tees = pgTable(
  "tees",
  {
    id: serial("id").primaryKey(),
    loopId: integer("loop_id").references(() => loops.id, { onDelete: "cascade" }),
    combinationId: integer("combination_id").references(() => combinations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    gender: text("gender").notNull().default("m"),
    courseRating: numeric("course_rating", { precision: 4, scale: 1 }),
    slope: integer("slope"),
    par: integer("par").notNull(),
    lengths: jsonb("lengths").$type<number[]>().notNull(),
    /** Wijzigingen krijgen een nieuwe rij met een latere geldig-vanaf-datum */
    validFrom: date("valid_from").notNull().default("2000-01-01"),
  },
  (t) => [index("tees_loop_idx").on(t.loopId), index("tees_comb_idx").on(t.combinationId)],
);

// ---------- Tas ----------

export const bagClubs = pgTable("bag_clubs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  avgDistance: integer("avg_distance"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ---------- Rondes ----------

export const rounds = pgTable(
  "rounds",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    clubId: integer("club_id").references(() => clubs.id, { onDelete: "set null" }),
    loopId: integer("loop_id").references(() => loops.id, { onDelete: "set null" }),
    combinationId: integer("combination_id").references(() => combinations.id, { onDelete: "set null" }),
    teeId: integer("tee_id").references(() => tees.id, { onDelete: "set null" }),
    /** Momentopname, zodat oude rondes hun baandata van toen houden */
    courseLabel: text("course_label").notNull(),
    teeLabel: text("tee_label"),
    holesCount: integer("holes_count").notNull(),
    format: text("format").notNull().default("stableford"),
    handicapIndex: numeric("handicap_index", { precision: 4, scale: 1 }),
    courseHandicap: integer("course_handicap"),
    playingHandicap: integer("playing_handicap"),
    courseRating: numeric("course_rating", { precision: 4, scale: 1 }),
    slope: integer("slope"),
    par: integer("par").notNull(),
    pcc: integer("pcc").notNull().default(0),
    /** ai_screenshot | ai_photo | manual | csv */
    source: text("source").notNull().default("manual"),
    qualifying: boolean("qualifying").notNull().default(true),
    /** default (volgt spelerinstelling) | private | shared */
    visibility: text("visibility").notNull().default("default"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("rounds_user_date_idx").on(t.userId, t.date)],
);

export const holeScores = pgTable(
  "hole_scores",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    par: integer("par").notNull(),
    si: integer("si").notNull(),
    length: integer("length"),
    /** null = hole niet gespeeld */
    strokes: integer("strokes"),
    points: integer("points"),
    putts: integer("putts"),
    /** hit | left | right | short | long | na */
    fairway: text("fairway"),
    gir: boolean("gir"),
    penalties: integer("penalties").notNull().default(0),
    bunker: integer("bunker").notNull().default(0),
  },
  (t) => [uniqueIndex("hole_scores_round_number").on(t.roundId, t.number)],
);

export const shots = pgTable(
  "shots",
  {
    id: serial("id").primaryKey(),
    holeScoreId: integer("hole_score_id")
      .notNull()
      .references(() => holeScores.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    bagClubId: integer("bag_club_id").references(() => bagClubs.id, { onDelete: "set null" }),
    /** tee | fairway | rough | bunker | recovery | green | penalty */
    lie: text("lie").notNull(),
    /** Afstand tot de vlag bij start, altijd in meters opgeslagen */
    distance: numeric("distance", { precision: 6, scale: 1 }).notNull(),
    penalty: boolean("penalty").notNull().default(false),
  },
  (t) => [index("shots_hole_idx").on(t.holeScoreId)],
);

export const imports = pgTable("imports", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  images: jsonb("images").$type<string[]>().notNull(),
  rawOutput: jsonb("raw_output"),
  draft: jsonb("draft"),
  checks: jsonb("checks"),
  /** pending | parsed | failed | saved */
  status: text("status").notNull().default("pending"),
  error: text("error"),
  roundId: integer("round_id").references(() => rounds.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Elke Gemini-aanroep, vóóraf vastgelegd (ook mislukte), zodat het AI-budget
 * (src/lib/aiBudget.ts) ook na een herstart klopt.
 */
export const aiCalls = pgTable(
  "ai_calls",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
    importId: integer("import_id").references(() => imports.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    /** null = bezig, true = gelukt, false = fout */
    ok: boolean("ok"),
    promptTokens: integer("prompt_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_calls_created_idx").on(t.createdAt), index("ai_calls_user_idx").on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Round = typeof rounds.$inferSelect;
export type HoleScore = typeof holeScores.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type Tee = typeof tees.$inferSelect;
