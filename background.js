// background.js
// Creates an action context menu to open the dashboard quickly

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.create({
      id: "openDashboard",
      title: "Open Dashboard",
      contexts: ["action"],
    });
  } catch (err) {
    // context menu may already exist on reload in dev
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "openDashboard") {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
  }
});



