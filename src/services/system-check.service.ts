import { Guild, PermissionFlagsBits } from "discord.js";
import { commandDefinitions } from "../command-definitions.js";
import { db } from "../db.js";
import { getGuildConfig } from "./config.service.js";
import { ensureAssignableRole } from "./reaction-role.service.js";

export type SystemCheckResult = { name: string; ok: boolean; detail: string };

export async function runSystemCheck(guild: Guild): Promise<SystemCheckResult[]> {
  const results: SystemCheckResult[] = [];
  const me = await guild.members.fetchMe();

  try {
    await db.$queryRaw`SELECT 1`;
    results.push({ name: "Database", ok: true, detail: "PostgreSQL kết nối được." });
  } catch {
    results.push({ name: "Database", ok: false, detail: "Không thể kết nối PostgreSQL." });
    return results;
  }

  const requiredPermissions = [
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.MoveMembers,
  ];
  const missingPermissions = requiredPermissions.filter((permission) => !me.permissions.has(permission));
  results.push({
    name: "Quyền bot",
    ok: missingPermissions.length === 0,
    detail: missingPermissions.length ? "Bot thiếu một hoặc nhiều quyền: Manage Messages, Manage Nicknames, Manage Roles, Move Members." : "Bot có đủ các quyền guild bắt buộc.",
  });

  const config = await getGuildConfig(guild.id);
  const leader = config.leaderRoleId ? await guild.roles.fetch(config.leaderRoleId).catch(() => null) : null;
  const technician = config.technicianRoleId ? await guild.roles.fetch(config.technicianRoleId).catch(() => null) : null;
  results.push({
    name: "Role quản lý",
    ok: Boolean(leader && technician),
    detail: leader && technician ? `Đội Trưởng: ${leader}; Technician: ${technician}.` : "Chưa cấu hình hoặc không tìm thấy role Đội Trưởng/Technician.",
  });

  const warningChannel = config.renameWarningChannelId ? await guild.channels.fetch(config.renameWarningChannelId).catch(() => null) : null;
  const warningPermissions = warningChannel?.isTextBased() ? warningChannel.permissionsFor(me) : null;
  results.push({
    name: "Channel #doi-ten",
    ok: Boolean(warningPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])),
    detail: warningPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]) ? `Bot có thể gửi warning tại ${warningChannel}.` : "Channel warning chưa cấu hình hoặc bot không thể xem/gửi embed tại đó.",
  });

  const expectedCommandNames = commandDefinitions.map((command) => command.name);
  const registered = await guild.client.application?.commands.fetch({ guildId: guild.id }).catch(() => null);
  const missingCommands = registered ? expectedCommandNames.filter((name) => !registered.some((command) => command.name === name)) : expectedCommandNames;
  results.push({
    name: "Slash commands",
    ok: missingCommands.length === 0,
    detail: missingCommands.length ? `Chưa đăng ký: ${missingCommands.map((name) => `/${name}`).join(", ")}. Chạy \`npm run commands:deploy\`.` : `Đã tìm thấy đủ ${expectedCommandNames.length} slash command.`,
  });

  const panels = await db.reactionRolePanel.findMany({ where: { guildId: guild.id }, include: { items: true } });
  let invalidItems = 0;
  let missingRoles = 0;
  for (const panel of panels) {
    for (const item of panel.items) {
      const role = await guild.roles.fetch(item.roleId).catch(() => null);
      if (!role) {
        missingRoles += 1;
        continue;
      }
      try {
        await ensureAssignableRole(guild, role);
      } catch {
        invalidItems += 1;
      }
    }
  }
  results.push({
    name: "Reaction role panels",
    ok: missingRoles === 0 && invalidItems === 0,
    detail: !panels.length ? "Chưa có panel nào." : missingRoles || invalidItems ? `${panels.length} panel; ${missingRoles} role đã mất, ${invalidItems} role không còn an toàn/quản lý được.` : `${panels.length} panel và ${panels.reduce((total, panel) => total + panel.items.length, 0)} item hợp lệ.`,
  });

  return results;
}
