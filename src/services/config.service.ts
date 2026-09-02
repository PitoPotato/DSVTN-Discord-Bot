import { db } from "../db.js";

export function getGuildConfig(guildId: string) {
  return db.guildConfig.upsert({ where: { guildId }, create: { guildId }, update: {} });
}

export function updateGuildConfig(guildId: string, data: {
  renameWarningChannelId?: string | null;
  leaderRoleId?: string | null;
  technicianRoleId?: string | null;
  verifiedRoleId?: string | null;
  unverifiedRoleId?: string | null;
}) {
  return db.guildConfig.upsert({ where: { guildId }, create: { guildId, ...data }, update: data });
}
