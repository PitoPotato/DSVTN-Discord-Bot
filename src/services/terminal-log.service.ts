export type TerminalLogStatus = "success" | "failure" | "warning";

export type TerminalLogEntry = {
  status: TerminalLogStatus;
  action: string;
  userId?: string;
  userTag?: string;
  guildId?: string;
  detail?: string;
};

const icons: Record<TerminalLogStatus, string> = {
  success: "🟢",
  failure: "🔴",
  warning: "🟡",
};

/** Writes one compact operational event to the bot terminal. */
export function logTerminal(entry: TerminalLogEntry): void {
  const parts = [formatTime(), icons[entry.status], entry.action];
  if (entry.userId) parts.push(`user=${entry.userTag ?? entry.userId}`);
  if (entry.guildId) parts.push(`guild=${entry.guildId}`);
  if (entry.detail) parts.push(compact(entry.detail));
  console.log(parts.join(" | "));
}

function formatTime(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function compact(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 160);
}
