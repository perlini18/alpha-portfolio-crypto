import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
let warnedMissingKey = false;

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn("[crypto] ENCRYPTION_KEY is not set; sensitive fields will remain plaintext");
    }
    return null;
  }
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

function looksEncryptedPayload(value: string) {
  const parts = value.split(":");
  if (parts.length !== 3) {
    return false;
  }
  return parts.every((part) => part.length > 0);
}

export function encryptText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const plain = value.trim();
  if (!plain) {
    return null;
  }
  const key = getKey();
  if (!key) {
    return plain;
  }

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const input = String(value);
  if (!looksEncryptedPayload(input)) {
    return input;
  }

  const key = getKey();
  if (!key) {
    return input;
  }

  const [ivB64, tagB64, dataB64] = input.split(":");
  try {
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(tagB64, "base64");
    const ciphertext = Buffer.from(dataB64, "base64");
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES || ciphertext.length === 0) {
      return "[Unable to decrypt]";
    }

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (error) {
    console.error("[crypto] failed to decrypt text payload");
    return "[Unable to decrypt]";
  }
}
