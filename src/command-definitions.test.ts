import { describe, expect, it } from "vitest";
import { commandDefinitions } from "./command-definitions.js";

type CommandJson = { name: string; options?: Array<{ name: string }> };

describe("slash command definitions", () => {
  const commands = commandDefinitions as CommandJson[];

  it("uses unique, lowercase command names", () => {
    const names = commands.map((command) => command.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(names.map((name) => name.toLowerCase()));
  });

  it("includes the identity, reaction role, and system-check command surface", () => {
    expect(commands.map((command) => command.name)).toEqual(expect.arrayContaining([
      "doiten", "identity", "technician", "config", "reaction-role", "system-check",
    ]));
    const reactionRole = commands.find((command) => command.name === "reaction-role");
    expect(reactionRole?.options?.map((option) => option.name)).toEqual(expect.arrayContaining([
      "panel-create", "panel-edit", "panel-list", "builder", "panel-info", "panel-delete",
      "panel-enable", "panel-disable", "item-add", "item-remove", "item-list",
      "field-add", "field-remove", "field-list",
      "publish", "refresh",
    ]));
  });

  it("keeps only /doiten enabled for ordinary members by default", () => {
    const doiten = commands.find((command) => command.name === "doiten") as CommandJson & { default_member_permissions?: string | null };
    expect(doiten.default_member_permissions).toBeUndefined();
    for (const name of ["identity", "technician", "config", "reaction-role", "system-check"]) {
      const command = commands.find((candidate) => candidate.name === name) as CommandJson & { default_member_permissions?: string | null };
      expect(command.default_member_permissions).toBe("0");
    }
  });
});
