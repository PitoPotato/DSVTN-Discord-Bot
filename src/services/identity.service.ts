import { GuildMember, PermissionFlagsBits } from "discord.js";
import { db } from "../db.js";
import { getGuildConfig } from "./config.service.js";

export class UserFacingError extends Error {}

export async function isVerified(guildId: string, userId: string): Promise<boolean> {
  const member = await db.verifiedMember.findUnique({
    where: { guildId_userId: { guildId, userId } },
    select: { isActive: true },
  });
  return member?.isActive === true;
}

export async function renameMember(member: GuildMember, rawName: string, verifiedBy?: string) {
  const fullName = rawName.trim();
  if (!fullName) throw new UserFacingError("Bạn cần nhập tên sau lệnh đổi tên.");
  if (fullName.length > 32) throw new UserFacingError("Nickname Discord chỉ được tối đa 32 ký tự.");

  const isGuildOwner = member.id === member.guild.ownerId;
  if (!isGuildOwner) {
    const botMember = await member.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageNicknames)) {
      throw new UserFacingError("Bot thiếu quyền Manage Nicknames.");
    }
    if (botMember.roles.highest.position <= member.roles.highest.position) {
      throw new UserFacingError("Role cao nhất của bot phải cao hơn role cao nhất của thành viên cần đổi tên.");
    }
    try {
      await member.setNickname(fullName, "Xác nhận tên qua DSVTN bot");
    } catch {
      throw new UserFacingError("Bot không thể đổi nickname này. Hãy kiểm tra quyền Manage Nicknames và thứ tự role của bot.");
    }
  }

  const config = await getGuildConfig(member.guild.id);
  await applyVerificationRoles(member, config.verifiedRoleId, config.unverifiedRoleId);

  const record = await db.verifiedMember.upsert({
    where: { guildId_userId: { guildId: member.guild.id, userId: member.id } },
    create: { guildId: member.guild.id, userId: member.id, fullName, verifiedBy: verifiedBy ?? member.id },
    update: { fullName, verifiedBy: verifiedBy ?? member.id, verifiedAt: new Date(), isActive: true },
  });
  return { record, nicknameUpdated: !isGuildOwner };
}

export async function removeVerification(member: GuildMember): Promise<void> {
  await db.verifiedMember.updateMany({
    where: { guildId: member.guild.id, userId: member.id },
    data: { isActive: false },
  });
  const config = await getGuildConfig(member.guild.id);
  if (config.verifiedRoleId && member.roles.cache.has(config.verifiedRoleId)) {
    await member.roles.remove(config.verifiedRoleId, "Hủy xác nhận tên qua DSVTN bot");
  }
  if (config.unverifiedRoleId && !member.roles.cache.has(config.unverifiedRoleId)) {
    await member.roles.add(config.unverifiedRoleId, "Hủy xác nhận tên qua DSVTN bot");
  }
}

async function applyVerificationRoles(member: GuildMember, verifiedRoleId: string | null, unverifiedRoleId: string | null) {
  try {
    if (verifiedRoleId && !member.roles.cache.has(verifiedRoleId)) {
      await member.roles.add(verifiedRoleId, "Đã xác nhận tên qua DSVTN bot");
    }
    if (unverifiedRoleId && member.roles.cache.has(unverifiedRoleId)) {
      await member.roles.remove(unverifiedRoleId, "Đã xác nhận tên qua DSVTN bot");
    }
  } catch {
    throw new UserFacingError("Nickname đã được đổi nhưng bot không thể cập nhật role xác nhận. Hãy kiểm tra thứ tự role của bot.");
  }
}
