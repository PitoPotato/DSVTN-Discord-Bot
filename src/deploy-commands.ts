import { REST, Routes } from "discord.js";
import { commandDefinitions } from "./command-definitions.js";
import { env } from "./env.js";
import { logTerminal } from "./services/terminal-log.service.js";

if (!env.guildId) throw new Error("Thiếu GUILD_ID trong file .env.");

const rest = new REST({ version: "10" }).setToken(env.discordToken);
await rest.put(Routes.applicationGuildCommands(env.applicationId, env.guildId), { body: commandDefinitions });
logTerminal({ status: "success", action: "Đăng ký slash command", guildId: env.guildId, detail: `${commandDefinitions.length} lệnh` });
