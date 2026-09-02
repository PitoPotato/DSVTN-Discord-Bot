import { afterEach, describe, expect, it, vi } from "vitest";
import { logTerminal } from "./terminal-log.service.js";

describe("terminal log", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["success", "🟢"],
    ["failure", "🔴"],
    ["warning", "🟡"],
  ] as const)("uses %s icon for a %s event", (status, icon) => {
    const write = vi.spyOn(console, "log").mockImplementation(() => undefined);

    logTerminal({ status, action: "/help", userId: "123", userTag: "Member", detail: "done" });

    expect(write).toHaveBeenCalledWith(expect.stringContaining(`${icon} | /help | user=Member | done`));
  });
});
