// First launch in a browser (no remembered account, so no cached screens): Today's read starts
// here, before the app's JS has downloaded and parsed. runtime.ts takes the promise. Not in the
// Tauri apps (their reads go through Rust with the Keychain token).
(function () {
  if (window.__TAURI_INTERNALS__) return;
  try { if (localStorage.getItem("todalo.account")) return; } catch (error) { return; }
  window.__todaloEarlyToday = fetch("/api/v1/today", { credentials: "same-origin", cache: "no-store" })
    .then(function (response) { return response.ok ? response.json() : null; })
    .catch(function () { return null; });
})();
