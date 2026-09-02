import { Guild, GuildMember, Message, MessageFlags, RepliableInteraction, User } from "discord.js";
import { errorEmbed } from "../embeds.js";
import { getGuildConfig } from "./config.service.js";

const instruction = "Để thuận tiện nhận diện và làm việc cùng nhau trong Đội, bạn vui lòng xác nhận **họ và tên thật, đầy đủ** trước khi sử dụng server.\n\nDùng `/doiten name:<Họ và tên đầy đủ>` hoặc `!dsvtn Doiten <Họ và tên đầy đủ>`.";

export async function warnUnverified(guild: Guild, user: User, location: string): Promise<void> {
  const embed = errorEmbed("Bạn chưa đổi tên", instruction);

  await Promise.allSettled([
    user.send({ embeds: [embed] }),
    sendWarningLog(guild, user.id, location),
  ]);
}

export async function warnMessageAndDelete(message: Message): Promise<void> {
  await message.delete().catch(() => undefined);
  const notice = message.channel.isSendable()
    ? await message.channel.send({ embeds: [errorEmbed("Bạn chưa đổi tên", instruction)] }).catch(() => undefined)
    : undefined;
  if (notice) setTimeout(() => void notice.delete().catch(() => undefined), 20_000);
  await warnUnverified(message.guild!, message.author, message.channel.toString());
}

export async function rejectInteraction(interaction: RepliableInteraction, location: string): Promise<void> {
  if (interaction.deferred) {
    await interaction.editReply({ embeds: [errorEmbed("Bạn chưa đổi tên", instruction)] }).catch(() => undefined);
  } else if (!interaction.replied) {
    await interaction.reply({ embeds: [errorEmbed("Bạn chưa đổi tên", instruction)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
  if (interaction.guild) await warnUnverified(interaction.guild, interaction.user, location);
}

export async function warnVoice(member: GuildMember, channelName: string): Promise<void> {
  await warnUnverified(member.guild, member.user, `voice channel **${channelName}**`);
}

async function sendWarningLog(guild: Guild, userId: string, location: string): Promise<void> {
  const config = await getGuildConfig(guild.id);
  if (!config.renameWarningChannelId) return;
  const channel = await guild.channels.fetch(config.renameWarningChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("send" in channel)) return;
  await channel.send({
    content: `<@${userId}>`,
    embeds: [errorEmbed("Tương tác bị chặn", `Thành viên chưa đổi tên và vừa tương tác tại ${location}.\n\n${instruction}`)],
  }).catch(() => undefined);
}
