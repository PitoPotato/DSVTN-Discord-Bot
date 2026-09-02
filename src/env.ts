import "dotenv/config";

function required(name: "DISCORD_TOKEN" | "APPLICATION_ID" | "DATABASE_URL"): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}. Hãy tạo file .env từ .env.example.`);
  return value;
}

export const env = {
  get discordToken() { return required("DISCORD_TOKEN"); },
  get applicationId() { return required("APPLICATION_ID"); },
  get databaseUrl() { return required("DATABASE_URL"); },
  get guildId() { return process.env.GUILD_ID; },
};
