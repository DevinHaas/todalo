"use server";

import { keyboardPreferenceStore } from "@todalo/server/keyboard";
import { requireUserId } from "@/lib/auth";
import { keyboardAccountPreferences } from "@/lib/keyboard-account-preferences";

const preferences = keyboardAccountPreferences(requireUserId, keyboardPreferenceStore);
export async function loadKeyboardPreferences() { return preferences.load(); }
export async function saveKeyboardPreferences(input: unknown) { return preferences.save(input); }
