import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// NOTE: `createdAt` is only used for ordering. Every other field is edited
// in place, so content changes in the DB show up on the site immediately.

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
  avatar: text("avatar").notNull().default("P"),
  color: text("color").notNull().default("avatar-1"),
  category: text("category").notNull().default("General"),
  tagClass: text("tag_class").notNull().default("tag-accent"),
  replies: integer("replies").notNull().default(0),
  last: text("last").notNull().default("just now"),
  pinned: boolean("pinned").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const forumReplies = pgTable("forum_replies", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull(),
  content: text("content").notNull(),
  author: text("author").notNull(),
  avatar: text("avatar").notNull().default("R"),
  color: text("color").notNull().default("avatar-2"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const galleryItems = pgTable("gallery_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  builder: text("builder").notNull().default("Unknown"),
  category: text("category").notNull().default("Build"),
  likes: integer("likes").notNull().default(0),
  image: text("image").notNull(),
  height: text("height").notNull().default("medium"),
});

export const timelineEvents = pgTable("timeline_events", {
  id: serial("id").primaryKey(),
  date: text("date").notNull(),
  title: text("title").notNull(),
  era: text("era").notNull().default("Era I"),
  major: boolean("major").notNull().default(false),
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
  role: text("role").notNull().default("member"),
  permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
  minecraftUsername: text("minecraft_username"),
  discordVerified: boolean("discord_verified").notNull().default(false),
  onboarded: boolean("onboarded").notNull().default(false),
  createdAt: text("created_at"),
});
