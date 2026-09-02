import { EmbedBuilder } from "discord.js";
import { getNotificationFooter } from "./services/notification-footer.service.js";

export function successEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x2ecc71).setTitle(`✅ ${title}`).setDescription(description).setFooter(getNotificationFooter());
}

export function errorEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0xe74c3c).setTitle(`🔒 ${title}`).setDescription(description).setFooter(getNotificationFooter());
}

export function infoEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder().setColor(0x3498db).setTitle(`ℹ️ ${title}`).setDescription(description).setFooter(getNotificationFooter());
}
