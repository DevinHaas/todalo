import { auth } from "@/lib/auth";

const email = process.env.TEST_USER_EMAIL ?? "test@todalo.dev";
const password = process.env.TEST_USER_PASSWORD ?? "password123";
const name = process.env.TEST_USER_NAME ?? "Test User";

async function main() {
  await auth.api.signUpEmail({ body: { name, email, password } });
  console.log(`Test user ready: ${email} / ${password}`);
}

main().catch((err) => {
  if (String(err).includes("USER_ALREADY_EXISTS")) {
    console.log(`Test user already exists: ${email} / ${password}`);
    return;
  }
  throw err;
});
