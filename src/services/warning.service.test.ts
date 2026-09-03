import { MessageType } from "discord.js";
import { describe, expect, it } from "vitest";
import { shouldBlockUnverifiedMessage } from "./warning.service.js";

describe("unverified-message moderation", () => {
  it("does not moderate bot messages or a thread-created system notice", () => {
    expect(shouldBlockUnverifiedMessage({ author: { bot: true }, type: MessageType.Default } as never)).toBe(false);
    expect(shouldBlockUnverifiedMessage({ author: { bot: false }, type: MessageType.ThreadCreated } as never)).toBe(false);
  });

  it("continues to moderate ordinary messages from people", () => {
    expect(shouldBlockUnverifiedMessage({ author: { bot: false }, type: MessageType.Default } as never)).toBe(true);
  });
});
