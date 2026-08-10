import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "miconstructor.mobile.session.v1";

export async function readSessionToken() {
  return SecureStore.getItemAsync(SESSION_KEY);
}

export async function writeSessionToken(token: string) {
  await SecureStore.setItemAsync(SESSION_KEY, token, {
    keychainService: "miconstructor.session",
  });
}

export async function clearSessionToken() {
  await SecureStore.deleteItemAsync(SESSION_KEY, {
    keychainService: "miconstructor.session",
  });
}
