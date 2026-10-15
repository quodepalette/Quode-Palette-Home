// Quode Palette Home — background service worker.
// Intentionally minimal: the new tab page does all the work. This worker
// just runs when the extension is installed or updated.
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Quode Palette Home", details.reason);
});
