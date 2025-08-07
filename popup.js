// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { cmd: "SCRAPE" }, details => {
    document.getElementById('fields').innerHTML = `
      <p><b>Address:</b> ${details.address}</p>
      <p><b>Beds:</b> ${details.beds} &nbsp; <b>Baths:</b> ${details.baths}</p>
      <p><b>Amenities:</b> ${details.amenities.join(', ') || 'None detected'}</p>
    `;
    window.scraped = {
      ...details,
      url: tab.url,
      source: new URL(tab.url).hostname
    };
  });
});

document.getElementById('saveBtn').onclick = () => {
  let listing = {
    ...window.scraped,
    id: Date.now().toString(),
    status: "new"
  };
  chrome.storage.local.get({ saved: [] }, data => {
    data.saved.push(listing);
    chrome.storage.local.set({ saved: data.saved }, () => {
      window.close();
    });
  });
};
