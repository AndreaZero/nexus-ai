import { defineConfig } from 'drizzle-kit';

// Generating SQL is offline; connection credentials are only read by the explicit migrate command.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  strict: true,
  verbose: false,
});
