import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  GuildMember,
  MessageFlags,
  Message,
  Partials,
} from "discord.js";
import { db } from "./db.js";
import { env } from "./env.js";
import { errorEmbed, infoEmbed, successEmbed } from "./embeds.js";
import { updateGuildConfig, getGuildConfig } from "./services/config.service.js";
import { isVerified, removeVerification, renameMember, UserFacingError } from "./services/identity.service.js";
import { isDiscordAdministrator, isLeader, isManager } from "./services/permission.service.js";
import {
  addItem,
  addEmbedField,
  buildFieldModal,
  createPanel,
  ensureAssignableRole,
  getPanel,
  getPanelById,
  buildContentModal,
  buildPanelMessage,
  buildVisualModal,
  handleReactionRoleComponent,
  isReactionRoleComponent,
  noneToNull,
  parseColor,
  PanelWithItems,
  publishPanel,
  refreshPanel,
  updatePanel,
} from "./services/reaction-role.service.js";
import { runSystemCheck } from "./services/system-check.service.js";
import { rejectInteraction, warnMessageAndDelete, warnUnverified, warnVoice } from "./services/warning.service.js";
import { logBotError } from "./services/error-log.service.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.once("clientReady", (readyClient) => {
  console.log(`Đã đăng nhập với ${readyClient.user.tag}.`);
});

client.on("error", (error) => {
  void logBotError({ action: "Discord client" }, error);
});

process.on("unhandledRejection", (error) => {
  void logBotError({ action: "unhandled promise rejection" }, error);
});

process.on("uncaughtException", (error) => {
  void logBotError({ action: "uncaught exception" }, error);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.bot || !message.guild || !message.member) return;

    const renameMatch = message.content.match(/^!dsvtn\s+doiten(?:\s+([\s\S]*?))?\s*$/i);
    if (renameMatch) {
      await handlePrefixRename(message, renameMatch[1] ?? "");
      return;
    }

    if (!(await isVerified(message.guild.id, message.author.id))) {
      await warnMessageAndDelete(message);
    }
  } catch (error) {
    await logBotError({ action: "messageCreate", guildId: message.guild?.id, userId: message.author.id }, error);
  }
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => undefined);
    const fullUser = await client.users.fetch(user.id).catch(() => null);
    if (!fullUser) return;
    const guild = reaction.message.guild;
    if (!guild || await isVerified(guild.id, fullUser.id)) return;

    await reaction.users.remove(fullUser.id).catch(() => undefined);
    await warnUnverified(guild, fullUser, reaction.message.channel.toString());
  } catch (error) {
    await logBotError({ action: "messageReactionAdd", guildId: reaction.message.guild?.id, userId: user.id }, error);
  }
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  try {
    if (!newState.member || !newState.channel || oldState.channelId === newState.channelId) return;
    if (await isVerified(newState.guild.id, newState.id)) return;

    await newState.disconnect("Chưa xác nhận tên với DSVTN bot").catch(() => undefined);
    await warnVoice(newState.member, newState.channel.name);
  } catch (error) {
    await logBotError({ action: "voiceStateUpdate", guildId: newState.guild.id, userId: newState.id }, error);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.guild || !interaction.member) return;
    const isBuilderModal = interaction.isModalSubmit() && interaction.customId.startsWith("rrbmodal:");
    const isBuilderPublish = interaction.isChannelSelectMenu() && interaction.customId.startsWith("rrb:");

    // Discord requires a slash-command acknowledgement within 3 seconds. Supabase
    // can take longer on its first query, so acknowledge before any database work.
    if (interaction.isChatInputCommand() || isBuilderModal || isBuilderPublish) {
      try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      } catch (error) {
        console.warn("Interaction đã hết hạn trước khi bot kịp defer:", error);
        return;
      }
    }

    const member = interaction.member instanceof GuildMember ? interaction.member : await interaction.guild.members.fetch(interaction.user.id);

    if (interaction.isChatInputCommand() && interaction.commandName === "doiten") {
      await handleSlashRename(interaction, member);
      return;
    }

    if (!(await isVerified(interaction.guild.id, interaction.user.id))) {
      if (interaction.isRepliable()) await rejectInteraction(interaction, interaction.channel?.toString() ?? "một interaction");
      return;
    }

    if (isBuilderModal) {
      await handleBuilderModal(interaction, member).catch(async (error) => {
        await logUnexpectedInteractionError(interaction, error);
        await replyBuilderError(interaction, error);
      });
      return;
    }

    if ((interaction.isButton() || interaction.isChannelSelectMenu()) && interaction.customId.startsWith("rrb:")) {
      await handleBuilderComponent(interaction, member).catch(async (error) => {
        await logUnexpectedInteractionError(interaction, error);
        await replyBuilderError(interaction, error);
      });
      return;
    }

    if ((interaction.isButton() || interaction.isStringSelectMenu()) && isReactionRoleComponent(interaction)) {
      await handleReactionRoleComponent(interaction, member).catch(async (error) => {
        await logUnexpectedInteractionError(interaction, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ embeds: [errorEmbed("Không thể cập nhật role", "Đã có lỗi xảy ra. Hãy thử lại sau.")], flags: MessageFlags.Ephemeral });
        }
      });
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    try {
      switch (interaction.commandName) {
        case "identity":
          await handleIdentityCommand(interaction, member);
          break;
        case "technician":
          await handleTechnicianCommand(interaction, member);
          break;
        case "config":
          await handleConfigCommand(interaction, member);
          break;
        case "reaction-role":
          await handleReactionRoleCommand(interaction, member);
          break;
        case "system-check":
          await handleSystemCheck(interaction, member);
          break;
      }
    } catch (error) {
      await logUnexpectedInteractionError(interaction, error);
      await replyError(interaction, error);
    }
  } catch (error) {
    await logUnexpectedInteractionError(interaction, error);
    await replyUnexpectedInteractionError(interaction, error);
  }
});

async function handlePrefixRename(message: Message, name: string) {
  try {
    const result = await renameMember(message.member!, name);
    await message.delete().catch(() => undefined);
    if (message.channel.isSendable()) {
      await message.channel.send({ embeds: [successEmbed("Đổi tên thành công", result.nicknameUpdated ? "Bạn đã có thể tương tác với server." : "Tên đã được xác nhận. Discord không cho bot đổi nickname của Server Owner; bạn hãy tự đổi nickname thủ công.")] });
    }
  } catch (error) {
    await logUnexpectedError({ action: "!dsvtn Doiten", guildId: message.guild?.id, userId: message.author.id }, error);
    await message.delete().catch(() => undefined);
    if (message.channel.isSendable()) {
      await message.channel.send({ embeds: [errorEmbed("Không thể đổi tên", getErrorMessage(error))] });
    }
  }
}

async function handleSlashRename(interaction: import("discord.js").ChatInputCommandInteraction, member: GuildMember) {
  try {
    const name = interaction.options.getString("name", true);
    const result = await renameMember(member, name);
    await interaction.editReply({ embeds: [successEmbed("Đổi tên thành công", result.nicknameUpdated ? "Bạn đã có thể tương tác với server." : "Tên đã được xác nhận. Discord không cho bot đổi nickname của Server Owner; bạn hãy tự đổi nickname thủ công.")] });
  } catch (error) {
    await logUnexpectedError({ action: "/doiten", guildId: interaction.guildId ?? undefined, userId: interaction.user.id }, error);
    await replyError(interaction, error);
  }
}

async function handleIdentityCommand(interaction: import("discord.js").ChatInputCommandInteraction, actor: GuildMember) {
  if (!(await isManager(actor))) throw new UserFacingError("Lệnh này chỉ dành cho Đội Trưởng hoặc Technician.");
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "list") {
    const page = interaction.options.getInteger("page") ?? 1;
    const take = 10;
    const [members, total] = await Promise.all([
      db.verifiedMember.findMany({ where: { guildId: actor.guild.id, isActive: true }, orderBy: { fullName: "asc" }, skip: (page - 1) * take, take }),
      db.verifiedMember.count({ where: { guildId: actor.guild.id, isActive: true } }),
    ]);
    if (!members.length) throw new UserFacingError(page === 1 ? "Chưa có thành viên nào đổi tên." : "Trang này không có dữ liệu.");
    const description = members.map((item, index) => `${(page - 1) * take + index + 1}. <@${item.userId}> — **${item.fullName}**`).join("\n");
    await interaction.editReply({ embeds: [infoEmbed(`Danh sách đã đổi tên — trang ${page}/${Math.ceil(total / take)}`, description)] });
    return;
  }

  if (subcommand === "search") {
    const keyword = interaction.options.getString("keyword", true);
    const members = await db.verifiedMember.findMany({ where: { guildId: actor.guild.id, isActive: true, fullName: { contains: keyword, mode: "insensitive" } }, orderBy: { fullName: "asc" }, take: 20 });
    const description = members.length ? members.map((item) => `<@${item.userId}> — **${item.fullName}**`).join("\n") : "Không tìm thấy kết quả.";
    await interaction.editReply({ embeds: [infoEmbed(`Kết quả tìm “${keyword}”`, description)] });
    return;
  }

  const user = interaction.options.getUser("member", true);
  const target = await actor.guild.members.fetch(user.id);
  if (subcommand === "remove") {
    await removeVerification(target);
    await interaction.editReply({ embeds: [successEmbed("Đã hủy xác nhận", `${user} cần đổi tên lại trước khi tương tác.`)] });
    return;
  }
  if (subcommand === "info") {
    const record = await db.verifiedMember.findUnique({ where: { guildId_userId: { guildId: actor.guild.id, userId: user.id } } });
    if (!record || !record.isActive) throw new UserFacingError("Thành viên này chưa đổi tên.");
    await interaction.editReply({ embeds: [infoEmbed("Thông tin đổi tên", `Thành viên: ${user}\nTên: **${record.fullName}**\nXác nhận: <t:${Math.floor(record.verifiedAt.getTime() / 1000)}:f>`)] });
    return;
  }

  if (subcommand === "sync-nickname") {
    const record = await db.verifiedMember.findUnique({ where: { guildId_userId: { guildId: actor.guild.id, userId: user.id } } });
    if (!record?.isActive) throw new UserFacingError("Thành viên này chưa đổi tên.");
    await renameMember(target, record.fullName, actor.id);
    await interaction.editReply({ embeds: [successEmbed("Đã đồng bộ nickname", `${user} hiện có nickname **${record.fullName}**.`)] });
    return;
  }

  const name = interaction.options.getString("name", true);
  await renameMember(target, name, actor.id);
  await interaction.editReply({ embeds: [successEmbed(subcommand === "add" ? "Đã thêm thành viên" : "Đã cập nhật tên", `${user} hiện dùng tên **${name.trim()}**.`)] });
}

async function handleTechnicianCommand(interaction: import("discord.js").ChatInputCommandInteraction, actor: GuildMember) {
  if (!(await isLeader(actor))) throw new UserFacingError("Lệnh này chỉ dành cho Đội Trưởng.");
  const config = await getGuildConfig(actor.guild.id);
  if (!config.technicianRoleId) throw new UserFacingError("Chưa cấu hình role Technician. Dùng `/config setup`.");
  const role = await actor.guild.roles.fetch(config.technicianRoleId);
  if (!role) throw new UserFacingError("Không tìm thấy role Technician đã cấu hình.");
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "list") {
    const description = role.members.size ? role.members.map((member) => `${member} — ${member.displayName}`).join("\n").slice(0, 4000) : "Chưa có Technician nào.";
    await interaction.editReply({ embeds: [infoEmbed("Danh sách Technician", description)] });
    return;
  }
  const user = interaction.options.getUser("member", true);
  const target = await actor.guild.members.fetch(user.id);
  if (subcommand === "add") {
    await target.roles.add(role, "Được Đội Trưởng thêm làm Technician");
    await interaction.editReply({ embeds: [successEmbed("Đã thêm Technician", `${user} hiện có quyền quản lý danh sách đổi tên.`)] });
  } else {
    await target.roles.remove(role, "Bị Đội Trưởng xóa khỏi Technician");
    await interaction.editReply({ embeds: [successEmbed("Đã xóa Technician", `${user} không còn quyền Technician.`)] });
  }
}

async function handleConfigCommand(interaction: import("discord.js").ChatInputCommandInteraction, actor: GuildMember) {
  if (!(await isLeader(actor)) && !isDiscordAdministrator(actor)) throw new UserFacingError("Chỉ Đội Trưởng mới được cấu hình bot.");
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "view") {
    const config = await getGuildConfig(actor.guild.id);
    await interaction.editReply({ embeds: [infoEmbed("Cấu hình bot", `Warning: ${config.renameWarningChannelId ? `<#${config.renameWarningChannelId}>` : "Chưa thiết lập"}\nĐội Trưởng: ${config.leaderRoleId ? `<@&${config.leaderRoleId}>` : "Chưa thiết lập"}\nTechnician: ${config.technicianRoleId ? `<@&${config.technicianRoleId}>` : "Chưa thiết lập"}`)] });
    return;
  }
  const channel = interaction.options.getChannel("doi-ten-channel", true);
  const leaderRole = interaction.options.getRole("leader-role", true);
  const technicianRole = interaction.options.getRole("technician-role", true);
  const verifiedRole = interaction.options.getRole("verified-role");
  const unverifiedRole = interaction.options.getRole("unverified-role");
  await updateGuildConfig(actor.guild.id, {
    renameWarningChannelId: channel.id,
    leaderRoleId: leaderRole.id,
    technicianRoleId: technicianRole.id,
    verifiedRoleId: verifiedRole?.id ?? null,
    unverifiedRoleId: unverifiedRole?.id ?? null,
  });
  await interaction.editReply({ embeds: [successEmbed("Đã lưu cấu hình", `Warning sẽ được gửi tới ${channel}.\nĐội Trưởng: ${leaderRole}\nTechnician: ${technicianRole}`)] });
}

async function handleReactionRoleCommand(interaction: import("discord.js").ChatInputCommandInteraction, actor: GuildMember) {
  if (!(await isManager(actor))) throw new UserFacingError("Lệnh này chỉ dành cho Đội Trưởng hoặc Technician.");
  const subcommand = interaction.options.getSubcommand();
  const guildId = actor.guild.id;

  if (subcommand === "panel-create") {
    const panel = await createPanel({
      guildId,
      name: interaction.options.getString("name", true),
      style: interaction.options.getString("style", true) as import("@prisma/client").ReactionRoleStyle,
      action: interaction.options.getString("action", true) as import("@prisma/client").ReactionRoleAction,
      title: interaction.options.getString("title", true),
      description: interaction.options.getString("description"),
      maxSelections: interaction.options.getInteger("max-selections"),
      createdBy: actor.id,
    });
    await interaction.editReply({ embeds: [successEmbed("Đã tạo panel", `Panel **${panel.name}** đã sẵn sàng. Hãy dùng \`/reaction-role item-add\` để thêm role.`)] });
    return;
  }

  if (subcommand === "panel-list") {
    const panels = await db.reactionRolePanel.findMany({ where: { guildId }, orderBy: { name: "asc" }, include: { _count: { select: { items: true } } } });
    const description = panels.length ? panels.map((panel) => `• **${panel.name}** — ${panel.style === "BUTTON" ? "Button" : "Menu"}, ${panel.action}, ${panel._count.items} role${panel.isEnabled ? "" : " (đang tắt)"}`).join("\n") : "Chưa có panel nào.";
    await interaction.editReply({ embeds: [infoEmbed("Reaction role panels", description)] });
    return;
  }

  if (subcommand === "builder") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    await interaction.editReply(buildBuilderPreview(panel));
    return;
  }

  if (subcommand === "panel-info") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    const description = [
      `Style: **${panel.style === "BUTTON" ? "Button" : "Menu"}**`,
      `Chế độ: **${describeAction(panel.action)}**`,
      `Chọn tối đa: **${panel.maxSelections}**`,
      `Trạng thái: **${panel.isEnabled ? "Đang bật" : "Đang tắt"}**`,
      `Đã gửi: ${panel.channelId && panel.messageId ? `<#${panel.channelId}>` : "Chưa"}`,
      `Số role: **${panel.items.length}/25**`,
      `Số field: **${panel.fields.length}/25**`,
    ].join("\n");
    await interaction.editReply({ embeds: [infoEmbed(`Panel: ${panel.name}`, description)] });
    return;
  }

  if (subcommand === "panel-edit") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    const titleInput = interaction.options.getString("title");
    const descriptionInput = interaction.options.getString("description");
    const colorInput = interaction.options.getString("color");
    const footerInput = interaction.options.getString("footer");
    const imageInput = interaction.options.getString("image-url");
    const thumbnailInput = interaction.options.getString("thumbnail-url");
    const maxSelections = interaction.options.getInteger("max-selections");
    if ([titleInput, descriptionInput, colorInput, footerInput, imageInput, thumbnailInput, maxSelections].every((value) => value === null)) {
      throw new UserFacingError("Hãy nhập ít nhất một nội dung cần chỉnh sửa.");
    }
    await updatePanel(panel, {
      ...(titleInput !== null ? { title: titleInput } : {}),
      ...(descriptionInput !== null ? { description: noneToNull(descriptionInput) } : {}),
      ...(colorInput !== null ? { color: parseColor(colorInput) } : {}),
      ...(footerInput !== null ? { footer: noneToNull(footerInput) } : {}),
      ...(imageInput !== null ? { imageUrl: noneToNull(imageInput) } : {}),
      ...(thumbnailInput !== null ? { thumbnailUrl: noneToNull(thumbnailInput) } : {}),
      ...(maxSelections !== null ? { maxSelections } : {}),
    });
    const fresh = await getPanel(guildId, panel.name, true);
    const refreshed = await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã chỉnh panel", refreshed ? "Embed đã được cập nhật ngay tại message đã gửi." : "Cấu hình đã được lưu.")] });
    return;
  }

  if (subcommand === "panel-enable" || subcommand === "panel-disable") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    const isEnabled = subcommand === "panel-enable";
    await db.reactionRolePanel.update({ where: { id: panel.id }, data: { isEnabled } });
    const fresh = await getPanel(guildId, panel.name, true);
    await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed(isEnabled ? "Đã bật panel" : "Đã tắt panel", `Panel **${panel.name}** hiện ${isEnabled ? "có thể" : "không thể"} được sử dụng.`)] });
    return;
  }

  if (subcommand === "panel-delete") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true));
    await db.reactionRolePanel.delete({ where: { id: panel.id } });
    await interaction.editReply({ embeds: [successEmbed("Đã xóa panel", `Panel **${panel.name}** đã bị xóa khỏi hệ thống. Message cũ (nếu có) sẽ không còn hoạt động.`)] });
    return;
  }

  if (subcommand === "item-list") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true), true);
    const description = panel.items.length ? panel.items.map((item, index) => `${index + 1}. <@&${item.roleId}> — **${item.label}**${item.emoji ? ` ${item.emoji}` : ""}`).join("\n") : "Panel này chưa có role nào.";
    await interaction.editReply({ embeds: [infoEmbed(`Items: ${panel.name}`, description)] });
    return;
  }

  if (subcommand === "item-add") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true));
    const selectedRole = interaction.options.getRole("role", true);
    const role = await actor.guild.roles.fetch(selectedRole.id);
    if (!role) throw new UserFacingError("Không tìm thấy role này trong server.");
    await ensureAssignableRole(actor.guild, role);
    const item = await addItem({
      panelId: panel.id,
      roleId: role.id,
      label: interaction.options.getString("label", true),
      emoji: interaction.options.getString("emoji"),
      description: interaction.options.getString("description"),
    });
    const fresh = await getPanel(guildId, panel.name, true);
    const refreshed = await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã thêm role", `${role} đã được thêm vào panel **${panel.name}**.${refreshed ? " Message đã được cập nhật." : ""}`)] });
    return;
  }

  if (subcommand === "item-remove") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true));
    const role = interaction.options.getRole("role", true);
    const deleted = await db.reactionRoleItem.deleteMany({ where: { panelId: panel.id, roleId: role.id } });
    if (!deleted.count) throw new UserFacingError("Role này không có trong panel.");
    const fresh = await getPanel(guildId, panel.name, true);
    const refreshed = await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã xóa role", `${role} đã được xóa khỏi panel **${panel.name}**.${refreshed ? " Message đã được cập nhật." : ""}`)] });
    return;
  }

  if (subcommand === "field-list") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true), true);
    const description = panel.fields.length
      ? panel.fields.map((field, index) => `**${index + 1}. ${field.name}**${field.inline ? " *(inline)*" : ""}\n${field.value}`).join("\n\n")
      : "Panel này chưa có embed field nào.";
    await interaction.editReply({ embeds: [infoEmbed(`Fields: ${panel.name}`, description)] });
    return;
  }

  if (subcommand === "field-add") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true), true);
    const field = await addEmbedField({
      panelId: panel.id,
      name: interaction.options.getString("name", true),
      value: interaction.options.getString("value", true),
      inline: interaction.options.getBoolean("inline") ?? false,
    });
    const fresh = await getPanel(guildId, panel.name, true);
    const refreshed = await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã thêm embed field", `**${field.name}** đã được thêm vào panel **${panel.name}**.${refreshed ? " Message đã được cập nhật." : ""}`)] });
    return;
  }

  if (subcommand === "field-remove") {
    const panel = await getPanel(guildId, interaction.options.getString("panel", true), true);
    const index = interaction.options.getInteger("index", true) - 1;
    const field = panel.fields[index];
    if (!field) throw new UserFacingError("Không tìm thấy field ở số thứ tự này.");
    await db.reactionRoleEmbedField.delete({ where: { id: field.id } });
    const fresh = await getPanel(guildId, panel.name, true);
    const refreshed = await refreshIfPublished(fresh, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã xóa embed field", `Field **${field.name}** đã được xóa.${refreshed ? " Message đã được cập nhật." : ""}`)] });
    return;
  }

  if (subcommand === "publish") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    if (!panel.items.length) throw new UserFacingError("Hãy thêm ít nhất một role trước khi gửi panel.");
    const selectedChannel = interaction.options.getChannel("channel", true);
    const channel = await actor.guild.channels.fetch(selectedChannel.id);
    if (!channel || !channel.isTextBased() || !("send" in channel)) throw new UserFacingError("Channel này không thể nhận message.");
    const { sent } = await publishPanel(panel, channel);
    await interaction.editReply({ embeds: [successEmbed("Đã gửi panel", `Panel **${panel.name}** đã được gửi tại ${sent.channel}.`)] });
    return;
  }

  if (subcommand === "refresh") {
    const panel = await getPanel(guildId, interaction.options.getString("name", true), true);
    await refreshPanel(panel, actor.guild);
    await interaction.editReply({ embeds: [successEmbed("Đã cập nhật panel", `Panel **${panel.name}** đã được render lại.`)] });
  }
}

async function refreshIfPublished(panel: PanelWithItems, guild: import("discord.js").Guild): Promise<boolean> {
  if (!panel.channelId || !panel.messageId) return false;
  try {
    await refreshPanel(panel, guild);
    return true;
  } catch (error) {
    console.error("Không thể refresh reaction-role panel", error);
    return false;
  }
}

function buildBuilderPreview(panel: PanelWithItems) {
  const preview = buildPanelMessage(panel);
  const contentButton = new ButtonBuilder()
    .setCustomId(`rrb:${panel.id}:content`)
    .setLabel("Chỉnh nội dung")
    .setEmoji("✏️")
    .setStyle(ButtonStyle.Primary);
  const visualButton = new ButtonBuilder()
    .setCustomId(`rrb:${panel.id}:visual`)
    .setLabel("Chỉnh giao diện")
    .setEmoji("🖼️")
    .setStyle(ButtonStyle.Secondary);
  const fieldButton = new ButtonBuilder()
    .setCustomId(`rrb:${panel.id}:field`)
    .setLabel("Thêm field")
    .setEmoji("➕")
    .setStyle(ButtonStyle.Secondary);
  const publishChannel = new ChannelSelectMenuBuilder()
    .setCustomId(`rrb:${panel.id}:publish`)
    .setPlaceholder("Chọn channel để publish panel")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1)
    .setMaxValues(1);

  return {
    embeds: preview.embeds,
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(contentButton, visualButton, fieldButton),
      new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(publishChannel),
    ],
  };
}

async function handleBuilderComponent(
  interaction: import("discord.js").ButtonInteraction | import("discord.js").ChannelSelectMenuInteraction,
  actor: GuildMember,
) {
  if (!(await isManager(actor))) throw new UserFacingError("Builder chỉ dành cho Đội Trưởng hoặc Technician.");
  const [, panelId, action] = interaction.customId.split(":");
  if (!panelId || !action) throw new UserFacingError("Dữ liệu Builder không hợp lệ.");
  const panel = await getPanelById(panelId);
  if (panel.guildId !== actor.guild.id) throw new UserFacingError("Panel này không thuộc server hiện tại.");

  if (interaction.isButton()) {
    if (action === "content") await interaction.showModal(buildContentModal(panel));
    else if (action === "visual") await interaction.showModal(buildVisualModal(panel));
    else if (action === "field") await interaction.showModal(buildFieldModal(panel));
    else throw new UserFacingError("Nút Builder không hợp lệ.");
    return;
  }

  if (action !== "publish") throw new UserFacingError("Lựa chọn Builder không hợp lệ.");
  if (!panel.items.length) throw new UserFacingError("Hãy thêm ít nhất một role trước khi publish panel.");
  const selectedChannelId = interaction.values[0];
  const channel = await actor.guild.channels.fetch(selectedChannelId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) throw new UserFacingError("Channel này không thể nhận message.");
  const { sent } = await publishPanel(panel, channel);
  await interaction.editReply({ embeds: [successEmbed("Đã publish panel", `Panel **${panel.name}** đã được gửi tại ${sent.channel}.`)] });
}

async function handleBuilderModal(interaction: import("discord.js").ModalSubmitInteraction, actor: GuildMember) {
  if (!(await isManager(actor))) throw new UserFacingError("Builder chỉ dành cho Đội Trưởng hoặc Technician.");
  const [, panelId, section] = interaction.customId.split(":");
  if (!panelId || !section) throw new UserFacingError("Dữ liệu Modal không hợp lệ.");
  const panel = await getPanelById(panelId);
  if (panel.guildId !== actor.guild.id) throw new UserFacingError("Panel này không thuộc server hiện tại.");

  if (section === "content") {
    const title = interaction.fields.getTextInputValue("title");
    const description = interaction.fields.getTextInputValue("description").trim();
    const footer = interaction.fields.getTextInputValue("footer").trim();
    await updatePanel(panel, { title, description: description || null, footer: footer || null });
  } else if (section === "visual") {
    const color = parseColor(interaction.fields.getTextInputValue("color"));
    const imageUrl = interaction.fields.getTextInputValue("image-url").trim();
    const thumbnailUrl = interaction.fields.getTextInputValue("thumbnail-url").trim();
    await updatePanel(panel, { color, imageUrl: imageUrl || null, thumbnailUrl: thumbnailUrl || null });
  } else if (section === "field") {
    const name = interaction.fields.getTextInputValue("name");
    const value = interaction.fields.getTextInputValue("value");
    const inlineValue = interaction.fields.getTextInputValue("inline").trim().toLowerCase();
    await addEmbedField({ panelId: panel.id, name, value, inline: ["yes", "y", "co", "có"].includes(inlineValue) });
  } else {
    throw new UserFacingError("Loại Modal không hợp lệ.");
  }

  const fresh = await getPanelById(panel.id);
  const refreshed = await refreshIfPublished(fresh, actor.guild);
  await interaction.editReply({ embeds: [successEmbed("Đã lưu thay đổi", refreshed ? "Panel embed đã được cập nhật tại channel đã publish." : "Cấu hình đã được lưu. Hãy publish panel khi sẵn sàng.")] });
}

async function replyBuilderError(interaction: import("discord.js").MessageComponentInteraction | import("discord.js").ModalSubmitInteraction, error: unknown) {
  const payload = { embeds: [errorEmbed("Builder không thể thực hiện", getErrorMessage(error))] };
  if (interaction.deferred) await interaction.editReply(payload);
  else if (interaction.replied) await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function describeAction(action: string): string {
  if (action === "ADD_ONLY") return "Chỉ lấy role";
  if (action === "REMOVE_ONLY") return "Chỉ gỡ role";
  return "Lấy hoặc gỡ role";
}

async function handleSystemCheck(interaction: import("discord.js").ChatInputCommandInteraction, actor: GuildMember) {
  if (!(await isManager(actor))) throw new UserFacingError("Lệnh này chỉ dành cho Đội Trưởng hoặc Technician.");
  const results = await runSystemCheck(actor.guild);
  const failures = results.filter((result) => !result.ok).length;
  const embed = new EmbedBuilder()
    .setColor(failures ? 0xe67e22 : 0x2ecc71)
    .setTitle(failures ? "⚠️ System check cần xử lý" : "✅ System check đạt yêu cầu")
    .setDescription(failures ? `${failures}/${results.length} hạng mục cần được kiểm tra.` : `Tất cả ${results.length} hạng mục đều ổn.`)
    .setFooter({ text: "DSVTN Bot — kiểm tra cấu hình" })
    .addFields(results.map((result) => ({ name: `${result.ok ? "✅" : "❌"} ${result.name}`, value: result.detail })));
  await interaction.editReply({ embeds: [embed] });
}

async function replyError(interaction: import("discord.js").ChatInputCommandInteraction, error: unknown) {
  const payload = { embeds: [errorEmbed("Không thể thực hiện", getErrorMessage(error))] };
  if (interaction.deferred) await interaction.editReply(payload);
  else if (interaction.replied) await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
  else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function replyUnexpectedInteractionError(interaction: import("discord.js").Interaction, error: unknown) {
  if (!interaction.isRepliable()) return;
  const payload = { embeds: [errorEmbed("Đã xảy ra lỗi", "Bot gặp lỗi khi xử lý yêu cầu này, nhưng vẫn đang hoạt động. Bạn hãy thử lại sau hoặc liên hệ Technician.")] };
  try {
    if (interaction.deferred) await interaction.editReply(payload);
    else if (interaction.replied) await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } catch (responseError) {
    // The original interaction may already have expired. It must not crash the bot.
    console.warn("Không thể gửi lỗi về interaction (có thể đã hết hạn):", responseError);
  }
}

async function logUnexpectedInteractionError(interaction: import("discord.js").Interaction, error: unknown) {
  await logUnexpectedError({
    action: getInteractionAction(interaction),
    guildId: interaction.guildId ?? undefined,
    userId: interaction.user?.id,
  }, error);
}

async function logUnexpectedError(context: Parameters<typeof logBotError>[0], error: unknown) {
  if (error instanceof UserFacingError) return;
  await logBotError(context, error);
}

function getInteractionAction(interaction: import("discord.js").Interaction): string {
  if (interaction.isChatInputCommand()) {
    const subcommand = interaction.options.getSubcommand(false);
    return `/${interaction.commandName}${subcommand ? ` ${subcommand}` : ""}`;
  }
  if (interaction.isModalSubmit()) return `Modal ${interaction.customId}`;
  if (interaction.isMessageComponent()) return `Component ${interaction.customId}`;
  return "Discord interaction";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  return "Đã có lỗi không xác định. Hãy thử lại hoặc liên hệ Technician.";
}

await db.$connect();
await client.login(env.discordToken);
