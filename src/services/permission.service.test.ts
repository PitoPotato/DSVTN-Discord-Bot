import { describe, expect, it } from "vitest";
import { permissionMatches, validatePermissionName } from "./permission.service.js";

describe("string authorization permissions", () => {
  it("matches exact, namespace wildcard, and global wildcard grants", () => {
    expect(permissionMatches("identity.write", "identity.write")).toBe(true);
    expect(permissionMatches("identity.*", "identity.read")).toBe(true);
    expect(permissionMatches("*", "access.manage")).toBe(true);
    expect(permissionMatches("identity.read", "identity.write")).toBe(false);
    expect(permissionMatches("identity.*", "reaction_role.manage")).toBe(false);
  });

  it("accepts catalog entries and controlled wildcard strings only", () => {
    expect(validatePermissionName("identity.write")).toBe("identity.write");
    expect(validatePermissionName("REACTION_ROLE.*")).toBe("reaction_role.*");
    expect(validatePermissionName("*")).toBe("*");
    expect(validatePermissionName("identity")).toBeNull();
    expect(validatePermissionName("identity.write;drop")).toBeNull();
  });
});
