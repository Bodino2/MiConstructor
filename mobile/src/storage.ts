import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "miconstructor.mobile.session.v1";
const OPTIONS = { keychainService: "miconstructor.session" } as const;

export async function readSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY, OPTIONS);
}

export async function writeSessionToken(token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, token, OPTIONS);
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY, OPTIONS);
}
