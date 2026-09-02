import { GuildMember, PermissionFlagsBits } from "discord.js";
import { getGuildConfig } from "./config.service.js";

export async function isManager(member: GuildMember): Promise<boolean> {
  const config = await getGuildConfig(member.guild.id);
  return Boolean(
    (config.leaderRoleId && member.roles.cache.has(config.leaderRoleId)) ||
    (config.technicianRoleId && member.roles.cache.has(config.technicianRoleId)),
  );
}

export async function isLeader(member: GuildMember): Promise<boolean> {
  const config = await getGuildConfig(member.guild.id);
  return Boolean(config.leaderRoleId && member.roles.cache.has(config.leaderRoleId));
}

export function isDiscordAdministrator(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}
