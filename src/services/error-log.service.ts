import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { logTerminal } from "./terminal-log.service.js";

export type ErrorContext = {
  action: string;
  guildId?: string;
  userId?: string;
};

const logDirectory = path.join(process.cwd(), "logs");

export async function logBotError(context: ErrorContext, error: unknown): Promise<void> {
  const now = new Date();
  const date = formatDate(now);
  const time = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
  const header = `[${date} ${time} ICT] Error while using ${context.action}`;
  const metadata = [
    context.guildId ? `Guild: ${context.guildId}` : null,
    context.userId ? `User: ${context.userId}` : null,
  ].filter(Boolean).join(" | ");
  const entry = `${header}${metadata ? `\n${metadata}` : ""}\n${details}\n${"-".repeat(80)}\n`;

  logTerminal({
    status: "failure",
    action: context.action,
    userId: context.userId,
    guildId: context.guildId,
    detail: error instanceof Error ? error.message : String(error),
  });
  try {
    await mkdir(logDirectory, { recursive: true });
    await appendFile(path.join(logDirectory, `${date}.log`), entry, "utf8");
  } catch (logError) {
    logTerminal({
      status: "failure",
      action: "Ghi file log",
      detail: logError instanceof Error ? logError.message : String(logError),
    });
  }
}

function formatDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
