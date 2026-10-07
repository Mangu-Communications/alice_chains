/** A1-002. Bootstrap identity from MASTER.md §7.5. The numeric id is operator-set. */

export const ALICE_SYSTEM_UNION_ID = "alice-v1-system";
export const ALICE_SYSTEM_NAME = "Alice";
export const ALICE_SYSTEM_ROLE = "user" as const;
export const ALICE_SYSTEM_STATUS = "I am Alice, an AI assistant.";

/** Exact §7.5 statement. INSERT IGNORE skips a second row on unique unionId. */
export const ALICE_SYSTEM_USER_INSERT =
  "INSERT IGNORE INTO users (unionId, name, role, status)\n" +
  `VALUES ('${ALICE_SYSTEM_UNION_ID}', '${ALICE_SYSTEM_NAME}', '${ALICE_SYSTEM_ROLE}', '${ALICE_SYSTEM_STATUS}');`;

/**
 * Read the operator-set Alice user id. Empty, missing, or non-numeric values
 * return null. This never invents a production id.
 */
export function readAliceUserId(env: Record<string, string | undefined> = process.env): number | null {
  const raw = (env === process.env ? process.env.ALICE_USER_ID : env.ALICE_USER_ID)?.trim() ?? "";
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}
