import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  GuildMember,
  Message,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  Role,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { Prisma, ReactionRoleAction, ReactionRolePanel, ReactionRoleStyle } from "@prisma/client";
import { db } from "../db.js";
import { errorEmbed, infoEmbed, successEmbed } from "../embeds.js";
import { isAuthorizationDiscordRole } from "./permission.service.js";
import { UserFacingError } from "./identity.service.js";

export type PanelWithItems = Prisma.ReactionRolePanelGetPayload<{ include: { items: true; fields: true } }>;

export async function createPanel(input: {
  guildId: string;
  name: string;
  style: ReactionRoleStyle;
  action: ReactionRoleAction;
  title: string;
  titleUrl?: string | null;
  description?: string | null;
  color?: number;
  authorName?: string | null;
  authorIconUrl?: string | null;
  footer?: string | null;
  footerIconUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  maxSelections?: number | null;
  createdBy: string;
}) {
  const name = input.name.trim();
  validatePanelText(input.title, input.description ?? null);
  if (!name) throw new UserFacingError("Tên quản lý của panel không được để trống.");
  const details = normalizeEmbedDetails(input);
  validateEmbedDetails(details);
  return db.reactionRolePanel.create({
    data: {
      guildId: input.guildId,
      name,
      style: input.style,
      action: input.action,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      color: input.color,
      ...details,
      maxSelections: input.maxSelections ?? 1,
      createdBy: input.createdBy,
    },
  }).catch((error: { code?: string }) => {
    if (error.code === "P2002") throw new UserFacingError("Tên panel này đã tồn tại trong server.");
    throw error;
  });
}

export function getPanel(guildId: string, name: string, includeItems: true): Promise<PanelWithItems>;
export function getPanel(guildId: string, name: string, includeItems?: false): Promise<ReactionRolePanel>;
export async function getPanel(guildId: string, name: string, includeItems = false): Promise<ReactionRolePanel | PanelWithItems> {
  const panel = await db.reactionRolePanel.findUnique({
    where: { guildId_name: { guildId, name: name.trim() } },
    ...(includeItems ? { include: { items: { orderBy: { position: "asc" as const } }, fields: { orderBy: { position: "asc" as const } } } } : {}),
  });
  if (!panel) throw new UserFacingError("Không tìm thấy panel reaction role này.");
  return panel as ReactionRolePanel | PanelWithItems;
}

export async function getPanelById(panelId: string): Promise<PanelWithItems> {
  const panel = await db.reactionRolePanel.findUnique({ where: { id: panelId }, include: { items: { orderBy: { position: "asc" } }, fields: { orderBy: { position: "asc" } } } });
  if (!panel) throw new UserFacingError("Không tìm thấy panel reaction role này.");
  return panel;
}

export async function updatePanel(panel: {
  id: string;
  title: string;
  description: string | null;
  titleUrl: string | null;
  authorName: string | null;
  authorIconUrl: string | null;
  footer: string | null;
  footerIconUrl: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
}, input: {
  title?: string;
  titleUrl?: string | null;
  description?: string | null;
  color?: number;
  authorName?: string | null;
  authorIconUrl?: string | null;
  footer?: string | null;
  footerIconUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
  maxSelections?: number;
}) {
  const title = input.title ?? panel.title;
  const description = input.description === undefined ? panel.description : input.description;
  validatePanelText(title, description);
  const details = normalizeEmbedDetails({
    titleUrl: input.titleUrl === undefined ? panel.titleUrl : input.titleUrl,
    authorName: input.authorName === undefined ? panel.authorName : input.authorName,
    authorIconUrl: input.authorIconUrl === undefined ? panel.authorIconUrl : input.authorIconUrl,
    footer: input.footer === undefined ? panel.footer : input.footer,
    footerIconUrl: input.footerIconUrl === undefined ? panel.footerIconUrl : input.footerIconUrl,
    imageUrl: input.imageUrl === undefined ? panel.imageUrl : input.imageUrl,
    thumbnailUrl: input.thumbnailUrl === undefined ? panel.thumbnailUrl : input.thumbnailUrl,
  });
  validateEmbedDetails(details);
  return db.reactionRolePanel.update({ where: { id: panel.id }, data: { ...input, ...details } });
}

export async function addItem(input: {
  panelId: string;
  roleId: string;
  label: string;
  emoji?: string | null;
  description?: string | null;
}) {
  const label = input.label.trim();
  if (!label || label.length > 80) throw new UserFacingError("Nhãn item phải có từ 1 đến 80 ký tự.");
  if (input.description && input.description.length > 100) throw new UserFacingError("Mô tả item chỉ được tối đa 100 ký tự.");
  const count = await db.reactionRoleItem.count({ where: { panelId: input.panelId } });
  if (count >= 25) throw new UserFacingError("Một panel Discord chỉ chứa tối đa 25 role.");
  return db.reactionRoleItem.create({
    data: { ...input, label, emoji: input.emoji?.trim() || null, description: input.description?.trim() || null, position: count },
  }).catch((error: { code?: string }) => {
    if (error.code === "P2002") throw new UserFacingError("Role này đã có trong panel.");
    throw error;
  });
}

export async function addEmbedField(input: { panelId: string; name: string; value: string; inline?: boolean }) {
  const name = input.name.trim();
  const value = input.value.trim();
  if (!name || name.length > 256) throw new UserFacingError("Tên field phải có từ 1 đến 256 ký tự.");
  if (!value || value.length > 1024) throw new UserFacingError("Nội dung field phải có từ 1 đến 1024 ký tự.");
  const count = await db.reactionRoleEmbedField.count({ where: { panelId: input.panelId } });
  if (count >= 25) throw new UserFacingError("Một embed Discord chỉ chứa tối đa 25 field.");
  return db.reactionRoleEmbedField.create({ data: { panelId: input.panelId, name, value, inline: input.inline ?? false, position: count } });
}

export function parseColor(raw: string): number {
  const normalized = raw.trim().replace(/^#/, "");
  if (!/^[\dA-Fa-f]{6}$/.test(normalized)) throw new UserFacingError("Màu phải là mã hex gồm 6 ký tự, ví dụ `#3498DB`.");
  return Number.parseInt(normalized, 16);
}

export function noneToNull(value: string | null): string | null | undefined {
  if (value === null) return undefined;
  return value.trim().toLowerCase() === "none" ? null : value.trim();
}

export function validateHttpUrl(value: string, label: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
  } catch {
    throw new UserFacingError(`${label} phải là URL http hoặc https hợp lệ.`);
  }
}

function normalizeEmbedDetails(input: {
  titleUrl?: string | null;
  authorName?: string | null;
  authorIconUrl?: string | null;
  footer?: string | null;
  footerIconUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value])) as {
    titleUrl: string | null;
    authorName: string | null;
    authorIconUrl: string | null;
    footer: string | null;
    footerIconUrl: string | null;
    imageUrl: string | null;
    thumbnailUrl: string | null;
  };
}

function validateEmbedDetails(details: ReturnType<typeof normalizeEmbedDetails>) {
  if (details.authorIconUrl && !details.authorName) throw new UserFacingError("Cần có tên tác giả trước khi đặt icon tác giả.");
  if (details.footerIconUrl && !details.footer) throw new UserFacingError("Cần có nội dung footer trước khi đặt icon footer.");
  for (const [label, url] of [
    ["Title URL", details.titleUrl],
    ["URL icon tác giả", details.authorIconUrl],
    ["URL icon footer", details.footerIconUrl],
    ["URL ảnh", details.imageUrl],
    ["URL thumbnail", details.thumbnailUrl],
  ] as const) {
    if (url) validateHttpUrl(url, label);
  }
}

export function buildPanelMessage(panel: PanelWithItems) {
  const embed = new EmbedBuilder().setColor(panel.color);
  if (panel.title) embed.setTitle(panel.title);
  if (panel.titleUrl) embed.setURL(panel.titleUrl);
  if (panel.description) embed.setDescription(panel.description);
  if (panel.fields.length) embed.addFields(panel.fields.map((field) => ({ name: field.name, value: field.value, inline: field.inline })));
  if (panel.authorName) embed.setAuthor({ name: panel.authorName, ...(panel.authorIconUrl ? { iconURL: panel.authorIconUrl } : {}) });
  if (panel.footer) embed.setFooter({ text: panel.footer, ...(panel.footerIconUrl ? { iconURL: panel.footerIconUrl } : {}) });
  if (panel.imageUrl) embed.setImage(panel.imageUrl);
  if (panel.thumbnailUrl) embed.setThumbnail(panel.thumbnailUrl);

  const embeds = hasEmbedContent(panel) ? [embed] : [];
  if (!panel.items.length) return { embeds, components: [] };
  if (panel.style === ReactionRoleStyle.MENU) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`rr:${panel.id}:m`)
      .setPlaceholder("Chọn role của bạn")
      .setMinValues(1)
      .setMaxValues(Math.min(panel.maxSelections, panel.items.length))
      .setDisabled(!panel.isEnabled)
      .addOptions(panel.items.map((item) => ({
        label: item.label,
        value: item.id,
        ...(item.emoji ? { emoji: item.emoji } : {}),
        ...(item.description ? { description: item.description } : {}),
      })));
    return { embeds, components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)] };
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < panel.items.length; index += 5) {
    const buttons = panel.items.slice(index, index + 5).map((item) => {
      const button = new ButtonBuilder()
        .setCustomId(`rr:${panel.id}:b:${item.id}`)
        .setLabel(item.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!panel.isEnabled);
      if (item.emoji) button.setEmoji(item.emoji);
      return button;
    });
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
  }
  return { embeds, components: rows };
}

function hasEmbedContent(panel: PanelWithItems): boolean {
  return Boolean(panel.title || panel.description || panel.fields.length || panel.authorName || panel.footer || panel.imageUrl || panel.thumbnailUrl);
}

export function buildContentModal(panel: PanelWithItems): ModalBuilder {
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Tiêu đề embed")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(false)
    .setValue(panel.title);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Nội dung embed")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.description ?? "");
  const footer = new TextInputBuilder()
    .setCustomId("footer")
    .setLabel("Footer")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(2048)
    .setRequired(false)
    .setValue(panel.footer ?? "");

  return new ModalBuilder()
    .setCustomId(`rrbmodal:${panel.id}:content`)
    .setTitle(`Chỉnh nội dung: ${panel.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(title),
      new ActionRowBuilder<TextInputBuilder>().addComponents(description),
      new ActionRowBuilder<TextInputBuilder>().addComponents(footer),
    );
}

export function buildVisualModal(panel: PanelWithItems): ModalBuilder {
  const color = new TextInputBuilder()
    .setCustomId("color")
    .setLabel("Màu hex, ví dụ #3498DB")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(7)
    .setRequired(true)
    .setValue(`#${panel.color.toString(16).padStart(6, "0").toUpperCase()}`);
  const image = new TextInputBuilder()
    .setCustomId("image-url")
    .setLabel("URL ảnh lớn (để trống để xóa)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.imageUrl ?? "");
  const thumbnail = new TextInputBuilder()
    .setCustomId("thumbnail-url")
    .setLabel("URL thumbnail (để trống để xóa)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.thumbnailUrl ?? "");
  const footerIcon = new TextInputBuilder()
    .setCustomId("footer-icon-url")
    .setLabel("URL icon footer (để trống để xóa)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.footerIconUrl ?? "");

  return new ModalBuilder()
    .setCustomId(`rrbmodal:${panel.id}:visual`)
    .setTitle(`Chỉnh giao diện: ${panel.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(color),
      new ActionRowBuilder<TextInputBuilder>().addComponents(image),
      new ActionRowBuilder<TextInputBuilder>().addComponents(thumbnail),
      new ActionRowBuilder<TextInputBuilder>().addComponents(footerIcon),
    );
}

export function buildAuthorModal(panel: PanelWithItems): ModalBuilder {
  const titleUrl = new TextInputBuilder()
    .setCustomId("title-url")
    .setLabel("URL khi bấm vào tiêu đề")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.titleUrl ?? "");
  const authorName = new TextInputBuilder()
    .setCustomId("author-name")
    .setLabel("Tên tác giả (để trống để xóa)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(false)
    .setValue(panel.authorName ?? "");
  const authorIcon = new TextInputBuilder()
    .setCustomId("author-icon-url")
    .setLabel("URL icon tác giả (để trống để xóa)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(4000)
    .setRequired(false)
    .setValue(panel.authorIconUrl ?? "");

  return new ModalBuilder()
    .setCustomId(`rrbmodal:${panel.id}:author`)
    .setTitle(`Chỉnh tác giả: ${panel.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(titleUrl),
      new ActionRowBuilder<TextInputBuilder>().addComponents(authorName),
      new ActionRowBuilder<TextInputBuilder>().addComponents(authorIcon),
    );
}

export function buildFieldModal(panel: PanelWithItems): ModalBuilder {
  const name = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("Tên field")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(256)
    .setRequired(true);
  const value = new TextInputBuilder()
    .setCustomId("value")
    .setLabel("Nội dung field")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(1024)
    .setRequired(true);
  const inline = new TextInputBuilder()
    .setCustomId("inline")
    .setLabel("Hiển thị cùng hàng? (yes/no, mặc định no)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(3)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(`rrbmodal:${panel.id}:field`)
    .setTitle(`Thêm field: ${panel.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(name),
      new ActionRowBuilder<TextInputBuilder>().addComponents(value),
      new ActionRowBuilder<TextInputBuilder>().addComponents(inline),
    );
}

export function buildItemModal(panel: PanelWithItems, roleId: string, roleName: string): ModalBuilder {
  const label = new TextInputBuilder()
    .setCustomId("label")
    .setLabel("Nhãn button / option")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(80)
    .setRequired(true)
    .setValue(roleName.slice(0, 80));
  const emoji = new TextInputBuilder()
    .setCustomId("emoji")
    .setLabel("Emoji (không bắt buộc)")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(false);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Mô tả option menu (không bắt buộc)")
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(100)
    .setRequired(false);

  return new ModalBuilder()
    .setCustomId(`rrbmodal:${panel.id}:add-item:${roleId}`)
    .setTitle(`Thêm ${panel.style === ReactionRoleStyle.BUTTON ? "button" : "option"}: ${panel.name}`.slice(0, 45))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(label),
      new ActionRowBuilder<TextInputBuilder>().addComponents(emoji),
      new ActionRowBuilder<TextInputBuilder>().addComponents(description),
    );
}

export async function publishPanel(panel: PanelWithItems, channel: { send: (options: ReturnType<typeof buildPanelMessage>) => Promise<Message> }) {
  const sent = await channel.send(buildPanelMessage(panel));
  const updated = await db.reactionRolePanel.update({ where: { id: panel.id }, data: { channelId: sent.channel.id, messageId: sent.id } });
  return { sent, updated };
}

export async function refreshPanel(panel: PanelWithItems, guild: Guild): Promise<void> {
  if (!panel.channelId || !panel.messageId) throw new UserFacingError("Panel này chưa được gửi. Dùng `/reaction-role publish` trước.");
  const channel = await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.isTextBased() || !("messages" in channel)) throw new UserFacingError("Không tìm thấy channel đã gửi panel.");
  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) throw new UserFacingError("Không tìm thấy message panel. Hãy gửi lại bằng `/reaction-role publish`.");
  await message.edit(buildPanelMessage(panel));
}

export async function ensureAssignableRole(guild: Guild, role: Role): Promise<void> {
  if (role.id === guild.id || role.managed) throw new UserFacingError("Không thể dùng role @everyone hoặc role do integration quản lý.");
  if (role.permissions.has(PermissionFlagsBits.Administrator)) throw new UserFacingError("Không thể đưa role Administrator vào reaction role.");
  if (await isAuthorizationDiscordRole(guild.id, role.id)) {
    throw new UserFacingError("Không thể đưa Discord role đang mang quyền quản trị bot vào reaction role.");
  }
  const me = await guild.members.fetchMe();
  if (role.position >= me.roles.highest.position) throw new UserFacingError("Role này cao hơn hoặc bằng role của bot nên bot không thể quản lý.");
}

export function isReactionRoleComponent(interaction: ButtonInteraction | StringSelectMenuInteraction): boolean {
  return interaction.customId.startsWith("rr:");
}

export async function handleReactionRoleComponent(interaction: ButtonInteraction | StringSelectMenuInteraction, member: GuildMember): Promise<void> {
  const parts = interaction.customId.split(":");
  const panelId = parts[1];
  if (!panelId) return;
  const panel = await db.reactionRolePanel.findUnique({ where: { id: panelId }, include: { items: { orderBy: { position: "asc" } } } });
  if (!panel || panel.guildId !== interaction.guildId || !panel.isEnabled) {
    await interaction.reply({ embeds: [errorEmbed("Panel không khả dụng", "Panel này đã bị xóa hoặc tắt.")], flags: MessageFlags.Ephemeral });
    return;
  }
  const itemIds = interaction.isStringSelectMenu() ? interaction.values : parts[2] === "b" && parts[3] ? [parts[3]] : [];
  const selectedItems = panel.items.filter((item) => itemIds.includes(item.id));
  if (!selectedItems.length) {
    await interaction.reply({ embeds: [errorEmbed("Dữ liệu không hợp lệ", "Không tìm thấy role được chọn trong panel.")], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const results: string[] = [];
  for (const item of selectedItems) {
    const role = await interaction.guild!.roles.fetch(item.roleId).catch(() => null);
    if (!role) {
      results.push(`⚠️ **${item.label}**: role không còn tồn tại.`);
      continue;
    }
    try {
      await ensureAssignableRole(interaction.guild!, role);
      const hasRole = member.roles.cache.has(role.id);
      if (panel.action === ReactionRoleAction.ADD_ONLY) {
        if (hasRole) results.push(`ℹ️ Bạn đã có ${role}.`);
        else { await member.roles.add(role, "Reaction role: add only"); results.push(`✅ Đã thêm ${role}.`); }
      } else if (panel.action === ReactionRoleAction.REMOVE_ONLY) {
        if (!hasRole) results.push(`ℹ️ Bạn chưa có ${role}.`);
        else { await member.roles.remove(role, "Reaction role: remove only"); results.push(`✅ Đã gỡ ${role}.`); }
      } else if (hasRole) {
        await member.roles.remove(role, "Reaction role: toggle remove");
        results.push(`✅ Đã gỡ ${role}.`);
      } else {
        await member.roles.add(role, "Reaction role: toggle add");
        results.push(`✅ Đã thêm ${role}.`);
      }
    } catch (error) {
      results.push(`⚠️ **${item.label}**: ${error instanceof UserFacingError ? error.message : "không thể cập nhật role."}`);
    }
  }
  await interaction.editReply({ embeds: [results.some((line) => line.startsWith("✅")) ? successEmbed("Cập nhật role", results.join("\n")) : infoEmbed("Trạng thái role", results.join("\n"))] });
}

function validatePanelText(title: string, description: string | null) {
  if (title.length > 256) throw new UserFacingError("Tiêu đề embed chỉ được tối đa 256 ký tự.");
  if (description && description.length > 4096) throw new UserFacingError("Nội dung embed chỉ được tối đa 4096 ký tự.");
}
