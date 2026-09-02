import { AsyncLocalStorage } from "node:async_hooks";
import type { APIEmbedFooter } from "discord.js";
import { getGuildConfig } from "./config.service.js";

const defaultFooter: APIEmbedFooter = { text: "Đội Sinh viên Tình nguyện khoa CNTT" };
const footerContext = new AsyncLocalStorage<APIEmbedFooter>();
const guildFooters = new Map<string, APIEmbedFooter>();

export function withGuildNotificationFooter<T>(guildId: string, action: () => Promise<T>): Promise<T> {
  return footerContext.run(guildFooters.get(guildId) ?? defaultFooter, action);
}

export async function warmGuildNotificationFooter(guildId: string): Promise<void> {
  const config = await getGuildConfig(guildId);
  setGuildNotificationFooter(guildId, config.notificationFooterText, config.notificationFooterIconUrl);
}

export function setGuildNotificationFooter(guildId: string, text: string | null, iconUrl: string | null): void {
  guildFooters.set(guildId, {
    text: text ?? defaultFooter.text,
    ...(iconUrl ? { icon_url: iconUrl } : {}),
  });
}

export function getNotificationFooter(): APIEmbedFooter {
  return footerContext.getStore() ?? defaultFooter;
}
