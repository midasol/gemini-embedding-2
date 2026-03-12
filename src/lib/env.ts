function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get GEMINI_API_KEY() { return requireEnv('GEMINI_API_KEY'); },
  get DATABASE_URL() { return requireEnv('DATABASE_URL'); },
  get GCS_BUCKET_NAME() { return requireEnv('GCS_BUCKET_NAME'); },
  get GCS_PROJECT_ID() { return requireEnv('GCS_PROJECT_ID'); },
  get GOOGLE_APPLICATION_CREDENTIALS() { return process.env.GOOGLE_APPLICATION_CREDENTIALS; },
};
