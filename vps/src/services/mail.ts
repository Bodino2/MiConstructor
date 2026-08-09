import nodemailer from "nodemailer";
import type { AppConfig } from "../config.js";
import type { Database, DatabaseClient } from "../db.js";

type Queryable = Pick<Database, "query"> | Pick<DatabaseClient, "query">;

export async function enqueueMail(
  database: Queryable,
  message: { recipient: string; subject: string; text: string; html: string },
) {
  await database.query(
    `INSERT INTO email_outbox (recipient, subject, text_body, html_body)
     VALUES ($1, $2, $3, $4)`,
    [message.recipient, message.subject, message.text, message.html],
  );
}

export async function dispatchMailOutbox(database: Database, config: AppConfig, limit = 20) {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS) return { sent: 0, skipped: true };
  const transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
  });
  const client = await database.connect();
  let sent = 0;
  try {
    await client.query("BEGIN");
    const rows = await client.query<{
      id: string;
      recipient: string;
      subject: string;
      text_body: string;
      html_body: string;
      attempts: number;
    }>(
      `SELECT id, recipient, subject, text_body, html_body, attempts
         FROM email_outbox
        WHERE sent_at IS NULL AND attempts < 5 AND next_attempt_at <= now()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
      [limit],
    );
    for (const row of rows.rows) {
      try {
        await transporter.sendMail({
          from: config.SMTP_FROM,
          to: row.recipient,
          subject: row.subject,
          text: row.text_body,
          html: row.html_body,
        });
        await client.query("UPDATE email_outbox SET sent_at = now(), last_error = NULL WHERE id = $1", [row.id]);
        sent += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : "Error SMTP";
        await client.query(
          `UPDATE email_outbox
              SET attempts = attempts + 1,
                  next_attempt_at = now() + make_interval(mins => power(2, attempts + 1)::int),
                  last_error = $2
            WHERE id = $1`,
          [row.id, reason],
        );
      }
    }
    await client.query("COMMIT");
    return { sent, skipped: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    transporter.close();
  }
}
