import net from "node:net";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildErasureNotice,
  deliverSmtp,
  notifyErasureRequested,
  readSmtpConfig,
} from "./erasure-mail";

describe("P4-004 erasure email", () => {
  it("stays unconfigured when host or from is empty", () => {
    expect(readSmtpConfig({})).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: "smtp.example.com" })).toBeNull();
    expect(readSmtpConfig({ SMTP_FROM: "ops@example.com" })).toBeNull();
    expect(readSmtpConfig({ SMTP_HOST: "  ", SMTP_FROM: "ops@example.com" })).toBeNull();
  });

  it("reads host, from, and port without inventing a password", () => {
    expect(
      readSmtpConfig({
        SMTP_HOST: "smtp.example.com",
        SMTP_FROM: "ops@example.com",
        SMTP_PORT: 2525,
      })
    ).toEqual({
      host: "smtp.example.com",
      from: "ops@example.com",
      port: 2525,
      secure: false,
      user: undefined,
      pass: undefined,
    });
  });

  it("builds a confirmation that does not claim the account is already gone", () => {
    const notice = buildErasureNotice({
      to: "member@example.com",
      name: "Riley",
      purgeAt: new Date("2026-11-06T12:00:00.000Z"),
      graceDays: 30,
    });
    expect(notice.subject).toBe("Alisons erasure request received");
    expect(notice.text).toContain("Riley");
    expect(notice.text).toContain("30 days");
    expect(notice.text).toContain("2026-11-06T12:00:00.000Z");
    expect(notice.text).toContain("does not delete the account");
    expect(notice.text).not.toMatch(/password|secret/i);
  });

  it("skips the network when SMTP is unset", async () => {
    const deliver = vi.fn();
    const result = await notifyErasureRequested(
      {
        to: "member@example.com",
        name: "Riley",
        userId: 4,
        purgeAt: new Date("2026-11-06T12:00:00.000Z"),
        graceDays: 30,
      },
      { deliver, config: null }
    );
    expect(result).toEqual({ status: "skipped", reason: "unconfigured" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("skips when the account has no address", async () => {
    const deliver = vi.fn();
    const result = await notifyErasureRequested(
      {
        to: "  ",
        name: "Riley",
        userId: 4,
        purgeAt: new Date("2026-11-06T12:00:00.000Z"),
        graceDays: 30,
      },
      {
        deliver,
        config: { host: "smtp.example.com", port: 587, secure: false, from: "ops@example.com" },
      }
    );
    expect(result).toEqual({ status: "skipped", reason: "no-address" });
    expect(deliver).not.toHaveBeenCalled();
  });

  it("sends the notice through the configured transport", async () => {
    const deliver = vi.fn().mockResolvedValue(undefined);
    const result = await notifyErasureRequested(
      {
        to: "member@example.com",
        name: "Riley",
        userId: 4,
        purgeAt: new Date("2026-11-06T12:00:00.000Z"),
        graceDays: 30,
      },
      {
        deliver,
        config: { host: "smtp.example.com", port: 587, secure: false, from: "ops@example.com" },
      }
    );
    expect(result).toEqual({ status: "sent" });
    expect(deliver).toHaveBeenCalledOnce();
    expect(deliver.mock.calls[0][0].to).toBe("member@example.com");
    expect(deliver.mock.calls[0][1].pass).toBeUndefined();
  });

  it("does not fail the request when delivery throws", async () => {
    const result = await notifyErasureRequested(
      {
        to: "member@example.com",
        name: "Riley",
        userId: 4,
        purgeAt: new Date("2026-11-06T12:00:00.000Z"),
        graceDays: 30,
      },
      {
        config: { host: "smtp.example.com", port: 587, secure: false, from: "ops@example.com" },
        deliver: async () => {
          throw new Error("mailbox refused");
        },
      }
    );
    expect(result).toEqual({ status: "failed" });
  });

  it("speaks SMTP to a local listener without a real credential", async () => {
    const received: string[] = [];
    const server = net.createServer((socket) => {
      socket.write("220 local ready\r\n");
      let dataMode = false;
      let body = "";
      socket.on("data", (chunk) => {
        const text = chunk.toString();
        if (dataMode) {
          body += text;
          if (body.includes("\r\n.\r\n")) {
            received.push(body);
            socket.write("250 queued\r\n");
            dataMode = false;
          }
          return;
        }
        for (const line of text.split("\r\n").filter(Boolean)) {
          if (line.startsWith("EHLO")) socket.write("250 alisons\r\n");
          else if (line.startsWith("MAIL FROM")) socket.write("250 ok\r\n");
          else if (line.startsWith("RCPT TO")) socket.write("250 ok\r\n");
          else if (line === "DATA") {
            dataMode = true;
            socket.write("354 go\r\n");
          } else if (line === "QUIT") socket.write("221 bye\r\n");
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no port");
    await deliverSmtp(
      buildErasureNotice({
        to: "member@example.com",
        name: "Riley",
        purgeAt: new Date("2026-11-06T12:00:00.000Z"),
        graceDays: 30,
      }),
      {
        host: "127.0.0.1",
        port: address.port,
        secure: false,
        from: "ops@example.com",
      }
    );
    server.close();
    expect(received.join("")).toContain("Subject: Alisons erasure request received");
    expect(received.join("")).toContain("member@example.com");
  });

  it("hooks the request path and leaves cancel and purge alone", () => {
    const source = readFileSync("api/admin-router.ts", "utf8");
    expect(source).toContain("notifyErasureRequested");
    expect(source).not.toMatch(/cancelDeletion[\s\S]{0,400}notifyErasureRequested/);
    expect(readFileSync("api/lib/erasure-mail.ts", "utf8")).not.toMatch(/purgeDueAccounts/);
  });
});
