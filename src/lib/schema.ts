import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// NOTE: `createdAt` is only used for ordering. Every other field is edited
// in place, so content changes in the DB show up on the site immediately.

/** @deprecated Unused demo table — the member roster reads `profiles`
 * (and fallback data). Kept so no migration drops data; do not seed. */
export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull().default("Member"),
  icon: text("icon").notNull().default("fa-user"),
  avatar: text("avatar").notNull(),
  color: text("color").notNull().default("avatar-1"),
  status: text("status").notNull().default("offline"),
  joined: text("joined").notNull().default("Day 1"),
  playtime: text("playtime").notNull().default("0h"),
});

export const forumThreads = pgTable("forum_threads", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  author: text("author").notNull(),
  authorId: text("author_id").notNull().default(""),
  avatar: text("avatar").notNull().default("P"),
  color: text("color").notNull().default("avatar-1"),
  category: text("category").notNull().default("General"),
  tagClass: text("tag_class").notNull().default("tag-accent"),
  replies: integer("replies").notNull().default(0),
  last: text("last").notNull().default("just now"),
  pinned: boolean("pinned").notNull().default(false),
  // --- Forum overhaul additions (all defaulted → additive migration) ---
  views: integer("views").notNull().default(0),
  locked: boolean("locked").notNull().default(false),
  likes: integer("likes").notNull().default(0),
  likedBy: jsonb("liked_by").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  editedAt: timestamp("edited_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const forumReplies = pgTable(
  "forum_replies",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id").notNull(),
    content: text("content").notNull(),
    author: text("author").notNull(),
    authorId: text("author_id").notNull().default(""),
    avatar: text("avatar").notNull().default("R"),
    color: text("color").notNull().default("avatar-2"),
    likes: integer("likes").notNull().default(0),
    likedBy: jsonb("liked_by").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    pinned: boolean("pinned").notNull().default(false),
    editedAt: timestamp("edited_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // Thread detail loads and the delete cascade filter on threadId constantly.
  (t) => [index("forum_replies_thread_id_idx").on(t.threadId)]
);

// Polls attach 1:1 to a thread. Only admins create them (enforced in the
// API, not the schema — the schema just stores). `options` carries the
// choice list; votes live in forumPollVotes so one-account-one-vote is a
// UNIQUE constraint instead of a hoped-for race-free jsonb update.
export const forumPolls = pgTable(
  "forum_polls",
  {
    id: serial("id").primaryKey(),
    threadId: integer("thread_id").notNull(),
    question: text("question").notNull(),
    options: jsonb("options").$type<Array<{ id: string; text: string }>>().notNull().default([]),
    endsAt: timestamp("ends_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // serializePoll looks a poll up by its thread on every thread-detail GET.
  (t) => [index("forum_polls_thread_id_idx").on(t.threadId)]
);

export const forumPollVotes = pgTable(
  "forum_poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id").notNull(),
    userId: text("user_id").notNull(),
    optionId: text("option_id").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("forum_poll_votes_poll_user_uq").on(t.pollId, t.userId)]
);

export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  builder: text("builder").notNull().default("Unknown"),
  category: text("category").notNull().default("Build"),
  likes: integer("likes").notNull().default(0),
  image: text("image").notNull(),
  height: text("height").notNull().default("medium"),
  // --- Gallery overhaul additions (all defaulted → additive migration) ---
  authorId: text("author_id").notNull().default(""),
  description: text("description").notNull().default(""),
  // All image URLs of the post; `image` stays the cover for backward compat.
  images: jsonb("images").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  likedBy: jsonb("liked_by").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  featured: boolean("featured").notNull().default(false),
  views: integer("views").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Comments on gallery posts — same shape/pattern as forum replies.
export const galleryComments = pgTable(
  "gallery_comments",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id").notNull(),
    content: text("content").notNull(),
    author: text("author").notNull(),
    authorId: text("author_id").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
  },
  // Detail loads, comment counts and the delete cascade filter on itemId.
  (t) => [index("gallery_comments_item_id_idx").on(t.itemId)]
);

export const timelineEvents = pgTable("timeline_events", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  era: text("era").notNull().default("Era I"),
  major: boolean("major").notNull().default(false),
  // Shown under major events on the History page (nullable — a one-line
  // event needs no body). Seeded by fallback-data / scripts/add-seasons.ts.
  description: text("description"),
});

export const ruleSections = pgTable("rule_sections", {
  id: serial("id").primaryKey(),
  icon: text("icon").notNull().default("fa-handshake"),
  title: text("title").notNull(),
  rules: jsonb("rules").$type<string[]>().notNull().default([]),
});

// User accounts — created by Discord OAuth, extended by onboarding.
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(), // "discord:<id>"
  username: text("username").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"), // Discord CDN profile picture
  role: text("role").notNull().default("member"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  minecraftUsername: text("minecraft_username"),
  discordVerified: boolean("discord_verified").notNull().default(false),
  onboarded: boolean("onboarded").notNull().default(false),
  // Set by the admin "Remove" action. The row is kept (not deleted) so the
  // Discord id stays denylisted — OAuth login refuses to recreate it.
  banned: boolean("banned").notNull().default(false),
  createdAt: text("created_at"),
}, (t) => [
  // A linked Minecraft name must belong to exactly one member: the
  // check-then-write in PATCH /api/profile races under concurrent claims,
  // so the database gets the final word (partial index — many NULLs allowed).
  uniqueIndex("profiles_mc_name_uq")
    .on(t.minecraftUsername)
    .where(sql`minecraft_username is not null`),
]);
