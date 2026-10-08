/**
 * SMTP confirmation for an erasure request (P4-004, US-188).
 *
 * Optional. Empty SMTP_HOST or SMTP_FROM means the operator has not configured
 * mail. The request still marks the account. This module does not invent
 * credentials, does not purge, and does not prune sessions.
 */
import net from "node:net";
import tls from "node:tls";
import { env } from "./env";
import { log } from "./logger";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
};

export type ErasureNotice = {
  to: string;
  subject: string;
  text: string;
};

export type ErasureNoticeResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "unconfigured" | "no-address" }
  | { status: "failed" };

type SmtpSource = {
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
};

export function readSmtpConfig(source: SmtpSource = env): SmtpConfig | null {
  const host = source.SMTP_HOST?.trim();
  const from = source.SMTP_FROM?.trim();
  if (!host || !from) return null;
  return {
    host,
    port: source.SMTP_PORT ?? 587,
    secure: source.SMTP_SECURE === true,
    user: source.SMTP_USER?.trim() || undefined,
    pass: source.SMTP_PASS || undefined,
    from,
  };
}

export function buildErasureNotice(input: {
  to: string;
  name: string | null;
  purgeAt: Date;
  graceDays: number;
}): ErasureNotice {
  const who = input.name?.trim() || "there";
  return {
    to: input.to,
    subject: "Alisons erasure request received",
    text: [
      `Hello ${who},`,
      "",
      "Alisons recorded your account erasure request.",
      "Your sessions were revoked.",
      `The account stays recoverable for ${input.graceDays} days.`,
      `Purge is scheduled after ${input.purgeAt.toISOString()} unless you cancel before then.`,
      "",
      "This note does not delete the account.",
    ].join("\n"),
  };
}

type Deliver = (notice: ErasureNotice, config: SmtpConfig) => Promise<void>;

export async function notifyErasureRequested(
  input: {
    to: string | null | undefined;
    name: string | null;
    userId: number;
    purgeAt: Date;
    graceDays: number;
  },
  options: { deliver?: Deliver; config?: SmtpConfig | null } = {}
): Promise<ErasureNoticeResult> {
  const config = options.config === undefined ? readSmtpConfig() : options.config;
  const deliver = options.deliver ?? deliverSmtp;
  if (!config) return { status: "skipped", reason: "unconfigured" };
  const to = input.to?.trim();
  if (!to) {
    log.warn("erasure notice skipped; account has no email", { userId: input.userId });
    return { status: "skipped", reason: "no-address" };
  }
  const notice = buildErasureNotice({
    to,
    name: input.name,
    purgeAt: input.purgeAt,
    graceDays: input.graceDays,
  });
  try {
    await deliver(notice, config);
    log.info("erasure notice sent", { userId: input.userId });
    return { status: "sent" };
  } catch (error) {
    log.error("erasure notice failed", {
      userId: input.userId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return { status: "failed" };
  }
}

export async function deliverSmtp(notice: ErasureNotice, config: SmtpConfig): Promise<void> {
  const socket = config.secure
    ? tls.connect({ host: config.host, port: config.port, servername: config.host })
    : net.connect({ host: config.host, port: config.port });
  socket.setEncoding("utf8");
  const pending: string[] = [];
  let buffer = "";
  let waiter: ((line: string) => void) | null = null;
  const take = () =>
    new Promise<string>((resolve, reject) => {
      const queued = pending.shift();
      if (queued) {
        resolve(queued);
        return;
      }
      waiter = resolve;
      socket.once("error", reject);
    });
  socket.on("data", (chunk: string) => {
    buffer += chunk;
    let end = buffer.indexOf("\r\n");
    while (end >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (waiter) {
        const resolve = waiter;
        waiter = null;
        resolve(line);
      } else pending.push(line);
      end = buffer.indexOf("\r\n");
    }
  });

  const expect = async (code: string) => {
    let line = await take();
    while (line.startsWith(`${code}-`)) line = await take();
    if (!line.startsWith(`${code} `) && line !== code) {
      throw new Error(`SMTP expected ${code}, got ${line.slice(0, 80)}`);
    }
  };
  const send = (line: string) => {
    socket.write(`${line}\r\n`);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.once("connect", () => resolve());
    });
    await expect("220");
    send("EHLO alisons");
    let ehlo = await take();
    const features = [ehlo];
    while (ehlo.startsWith("250-")) {
      ehlo = await take();
      features.push(ehlo);
    }
    if (!ehlo.startsWith("250")) throw new Error(`SMTP EHLO failed: ${ehlo.slice(0, 80)}`);
    if (!config.secure && features.some((line) => /STARTTLS/i.test(line))) {
      send("STARTTLS");
      await expect("220");
      const secure = tls.connect({ socket, servername: config.host });
      secure.setEncoding("utf8");
      socket.removeAllListeners("data");
      secure.on("data", (chunk: string) => {
        buffer += chunk;
        let end = buffer.indexOf("\r\n");
        while (end >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (waiter) {
            const resolve = waiter;
            waiter = null;
            resolve(line);
          } else pending.push(line);
          end = buffer.indexOf("\r\n");
        }
      });
      await new Promise<void>((resolve, reject) => {
        secure.once("secureConnect", () => resolve());
        secure.once("error", reject);
      });
      const write = (line: string) => secure.write(`${line}\r\n`);
      write("EHLO alisons");
      let again = await take();
      while (again.startsWith("250-")) again = await take();
      if (!again.startsWith("250")) throw new Error(`SMTP EHLO failed: ${again.slice(0, 80)}`);
      await authAndSend(write, notice, config, expect);
      secure.end();
      return;
    }
    await authAndSend(send, notice, config, expect);
    socket.end();
  } catch (error) {
    socket.destroy();
    throw error;
  }
}

async function authAndSend(
  send: (line: string) => void,
  notice: ErasureNotice,
  config: SmtpConfig,
  expect: (code: string) => Promise<void>
) {
  if (config.user && config.pass) {
    send("AUTH LOGIN");
    await expect("334");
    send(Buffer.from(config.user).toString("base64"));
    await expect("334");
    send(Buffer.from(config.pass).toString("base64"));
    await expect("235");
  }
  send(`MAIL FROM:<${config.from}>`);
  await expect("250");
  send(`RCPT TO:<${notice.to}>`);
  await expect("250");
  send("DATA");
  await expect("354");
  const body = [
    `From: ${config.from}`,
    `To: ${notice.to}`,
    `Subject: ${notice.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    notice.text.replace(/^\./gm, ".."),
    ".",
  ].join("\r\n");
  send(body);
  await expect("250");
  send("QUIT");
}
