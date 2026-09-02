import { GuildMember, PermissionFlagsBits } from "discord.js";
import { db } from "../db.js";
import { getGuildConfig } from "./config.service.js";

/**
 * Permission names are stable API values, not Discord permission bitfields.
 * New modules should add their permission here before checking it.
 */
export const PERMISSIONS = {
  ADMIN_HELP: "admin.help",
  ACCESS_MANAGE: "access.manage",
  CONFIG_MANAGE: "config.manage",
  IDENTITY_READ: "identity.read",
  IDENTITY_WRITE: "identity.write",
  REACTION_ROLE_MANAGE: "reaction_role.manage",
  SYSTEM_CHECK: "system.check",
  TECHNICIAN_MANAGE: "technician.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CATALOG: ReadonlyArray<{ value: Permission; label: string; description: string }> = [
  { value: PERMISSIONS.ADMIN_HELP, label: "Xem hướng dẫn quản trị", description: "Xem /helpadmin." },
  { value: PERMISSIONS.ACCESS_MANAGE, label: "Quản trị phân quyền", description: "Tạo role, cấp quyền và liên kết Discord role." },
  { value: PERMISSIONS.CONFIG_MANAGE, label: "Cấu hình bot", description: "Thay đổi cấu hình server và footer thông báo." },
  { value: PERMISSIONS.IDENTITY_READ, label: "Xem danh sách tên", description: "Xem, tìm và tra cứu thành viên đã xác nhận tên." },
  { value: PERMISSIONS.IDENTITY_WRITE, label: "Quản lý xác nhận tên", description: "Thêm, sửa, hủy hoặc đồng bộ nickname." },
  { value: PERMISSIONS.REACTION_ROLE_MANAGE, label: "Quản lý reaction role", description: "Tạo, sửa, publish và quản lý panel role." },
  { value: PERMISSIONS.SYSTEM_CHECK, label: "Chạy system check", description: "Kiểm tra cấu hình và quyền của bot." },
  { value: PERMISSIONS.TECHNICIAN_MANAGE, label: "Quản lý Technician", description: "Thêm, xóa và xem danh sách Technician." },
];

const LEGACY_LEADER_KEY = "system.legacy_leader";
const LEGACY_TECHNICIAN_KEY = "system.legacy_technician";

const LEGACY_LEADER_PERMISSIONS = ["*"];
const LEGACY_TECHNICIAN_PERMISSIONS = [
  PERMISSIONS.ADMIN_HELP,
  PERMISSIONS.IDENTITY_READ,
  PERMISSIONS.IDENTITY_WRITE,
  PERMISSIONS.REACTION_ROLE_MANAGE,
  PERMISSIONS.SYSTEM_CHECK,
];

/** Only administrators can bootstrap or recover authorization management. */
export function isDiscordAdministrator(member: GuildMember): boolean {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Supports exact permissions plus `module.*` and `*` grants. A wildcard is
 * useful for a trusted owner role while ordinary roles should receive exact,
 * granular strings from PERMISSION_CATALOG.
 */
export function permissionMatches(granted: string, required: string): boolean {
  return granted === "*" || granted === required || (granted.endsWith(".*") && required.startsWith(granted.slice(0, -1)));
}

export function isPermissionName(value: string): value is Permission {
  return PERMISSION_CATALOG.some((permission) => permission.value === value);
}

export function validatePermissionName(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "*" || /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*\.\*$/.test(normalized) || isPermissionName(normalized)) return normalized;
  return null;
}

/**
 * Compatibility bridge for existing installations. It keeps the configured
 * Đội Trưởng and Technician Discord roles working as system authorization
 * roles, while all future checks use the new tables.
 */
export async function ensureDefaultAuthorizationRoles(guildId: string): Promise<void> {
  const config = await getGuildConfig(guildId);
  await upsertSystemRole(guildId, LEGACY_LEADER_KEY, "Đội Trưởng", "Vai trò tương thích từ cấu hình cũ; toàn quyền.", LEGACY_LEADER_PERMISSIONS, config.leaderRoleId);
  await upsertSystemRole(guildId, LEGACY_TECHNICIAN_KEY, "Technician", "Vai trò tương thích từ cấu hình cũ.", LEGACY_TECHNICIAN_PERMISSIONS, config.technicianRoleId);
}

async function upsertSystemRole(
  guildId: string,
  key: string,
  name: string,
  description: string,
  permissions: string[],
  discordRoleId: string | null,
): Promise<void> {
  const role = await db.authorizationRole.upsert({
    where: { guildId_key: { guildId, key } },
    create: {
      guildId,
      key,
      name,
      description,
      isSystem: true,
      permissions: { createMany: { data: permissions.map((permission) => ({ permission })), skipDuplicates: true } },
    },
    update: { name, description, isSystem: true },
  });

  // System roles mirror the current legacy config exactly. This prevents a
  // previously configured leader/technician Discord role retaining access
  // after `/config setup` is changed.
  await db.authorizationRoleBinding.deleteMany({
    where: { roleId: role.id, ...(discordRoleId ? { discordRoleId: { not: discordRoleId } } : {}) },
  });
  if (!discordRoleId) return;
  await db.authorizationRoleBinding.upsert({
    where: { roleId_discordRoleId: { roleId: role.id, discordRoleId } },
    create: { roleId: role.id, discordRoleId },
    update: {},
  });
}

export async function getMemberPermissions(member: GuildMember): Promise<string[]> {
  if (isDiscordAdministrator(member)) return ["*"];
  await ensureDefaultAuthorizationRoles(member.guild.id);
  const discordRoleIds = [...member.roles.cache.keys()];
  if (!discordRoleIds.length) return [];
  const bindings = await db.authorizationRoleBinding.findMany({
    where: { discordRoleId: { in: discordRoleIds }, role: { guildId: member.guild.id } },
    select: { role: { select: { permissions: { select: { permission: true } } } } },
  });
  return [...new Set(bindings.flatMap((binding) => binding.role.permissions.map((item) => item.permission)))];
}

export async function hasPermission(member: GuildMember, required: string): Promise<boolean> {
  const permissions = await getMemberPermissions(member);
  return permissions.some((granted) => permissionMatches(granted, required));
}

export async function hasAnyPermission(member: GuildMember, required: readonly string[]): Promise<boolean> {
  const permissions = await getMemberPermissions(member);
  return required.some((permission) => permissions.some((granted) => permissionMatches(granted, permission)));
}

export async function isAuthorizationDiscordRole(guildId: string, discordRoleId: string): Promise<boolean> {
  await ensureDefaultAuthorizationRoles(guildId);
  return Boolean(await db.authorizationRoleBinding.findFirst({ where: { discordRoleId, role: { guildId } }, select: { id: true } }));
}
