import { describe, expect, it } from "vitest";
import { parseMinecraftListResponse } from "../lib/adapters/minecraft-adapter";

/**
 * The MC RCON `list` response format is technically stable across vanilla
 * versions ("There are N of a max of M players online: name1, name2, ...")
 * but a few mods prepend tags or swap separators. The parser keeps it loose
 * on purpose — anything before the first ":" is treated as preamble, and
 * the rest is a comma-separated name list with whitespace trimmed. These
 * tests pin the cases we care about; if a mod ever breaks them we'll add a
 * fixture rather than complicate the regex.
 */
describe("parseMinecraftListResponse", () => {
  it("parses the standard 2-player vanilla response", () => {
    const raw = "There are 2 of a max of 20 players online: Alice, Bob";
    expect(parseMinecraftListResponse(raw)).toEqual(["Alice", "Bob"]);
  });

  it("parses a single-player response", () => {
    const raw = "There are 1 of a max of 20 players online: Maltaine";
    expect(parseMinecraftListResponse(raw)).toEqual(["Maltaine"]);
  });

  it("returns [] for the empty-roster format with trailing space", () => {
    const raw = "There are 0 of a max of 20 players online: ";
    expect(parseMinecraftListResponse(raw)).toEqual([]);
  });

  it("returns [] for the empty-roster format with no trailing space", () => {
    const raw = "There are 0 of a max of 20 players online:";
    expect(parseMinecraftListResponse(raw)).toEqual([]);
  });

  it("returns [] for an empty string (RCON disconnected mid-response)", () => {
    expect(parseMinecraftListResponse("")).toEqual([]);
  });

  it("returns [] when the response has no colon (unexpected mod format)", () => {
    expect(parseMinecraftListResponse("server is loading")).toEqual([]);
  });

  it("trims whitespace around each name", () => {
    const raw = "There are 3 of a max of 20 players online:  Alice ,Bob,   Carol";
    expect(parseMinecraftListResponse(raw)).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("drops empty entries from trailing commas / double commas", () => {
    const raw = "There are 2 of a max of 20 players online: Alice,,Bob,";
    expect(parseMinecraftListResponse(raw)).toEqual(["Alice", "Bob"]);
  });

  it("tolerates extra colons in the suffix (mod nameplate with colon)", () => {
    // First colon wins; nicknames with colons survive as part of the player name.
    const raw =
      "There are 2 of a max of 20 players online: Alice: the Wanderer, Bob";
    expect(parseMinecraftListResponse(raw)).toEqual([
      "Alice: the Wanderer",
      "Bob",
    ]);
  });

  it("preserves player names containing underscores and digits", () => {
    const raw = "There are 1 of a max of 20 players online: x_Player_42";
    expect(parseMinecraftListResponse(raw)).toEqual(["x_Player_42"]);
  });
});
