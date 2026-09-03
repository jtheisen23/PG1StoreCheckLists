function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

export function authSecret(): Uint8Array {
  const secret = required("AUTH_SECRET", process.env.AUTH_SECRET);
  if (secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export const isProduction = process.env.NODE_ENV === "production";
