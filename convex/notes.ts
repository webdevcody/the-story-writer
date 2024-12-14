// TODO: create a convex mutation to allow authenticated users to upload notes

import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  createNote: { kind: "fixed window", rate: 1, period: MINUTE },
});

export const uploadNote = mutation({
  args: {
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (!userId) {
      throw new Error("Unauthorized");
    }

    await rateLimiter.limit(ctx, "createNote", {
      key: userId,
      throws: true,
    });

    await ctx.db.insert("notes", {
      body: args.body,
      userId,
    });
  },
});

async function assertNoteOwner(ctx: QueryCtx, noteId: Id<"notes">) {
  const userId = await getAuthUserId(ctx);

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const note = await ctx.db.get(noteId);
  if (!note) {
    throw new Error("Note not found");
  }

  if (note.userId !== userId) {
    throw new Error("Unauthorized");
  }
  return note;
}

export const deleteNote = mutation({
  args: {
    noteId: v.id("notes"),
  },
  handler: async (ctx, args) => {
    await assertNoteOwner(ctx, args.noteId);
    await ctx.db.delete(args.noteId);
  },
});

export const getNotes = query({
  handler: async (ctx) => {
    const notes = await ctx.db.query("notes").collect();

    const notesWithUserImage = await Promise.all(
      notes.map(async (note) => {
        const user = await ctx.db.get(note.userId);
        return {
          ...note,
          userImage: user?.image,
          userName: user?.name,
        };
      }),
    );

    return notesWithUserImage;
  },
});
