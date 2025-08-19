// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { cmd: "SCRAPE" }, details => {
    if (!details) details = { address: '', beds: 0, baths: 0, amenities: [], price: null, description: '', zip: '' };
    const amenitiesText = details.amenities?.join(', ') || '';
    document.getElementById('fields').innerHTML = `
      <label>Address<br><input id="address" value="${details.address || ''}" /></label>
      <div class="row">
        <label>Beds<br><input id="beds" type="number" min="0" step="0.5" value="${details.beds || 0}" /></label>
        <label>Baths<br><input id="baths" type="number" min="0" step="0.5" value="${details.baths || 0}" /></label>
      </div>
      <label>Price<br><input id="price" value="${details.price || ''}" placeholder="$3,200" /></label>
      <label>ZIP<br><input id="zip" value="${details.zip || ''}" placeholder="11385" /></label>
      <label>Description<br><textarea id="description" rows="3" placeholder="Listing description">${(details.description || '').slice(0, 2000)}</textarea></label>
      <label>Amenities<br><textarea id="amenities" rows="2" placeholder="Comma separated">${amenitiesText}</textarea></label>
      <label>Notes <small>(private)</small><br><textarea id="notes" rows="2" placeholder="e.g., great light, broker fee"></textarea></label>
    `;
    window.scraped = {
      ...details,
      url: tab.url,
      source: new URL(tab.url).hostname
    };
  });

  document.getElementById('openDashboard').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    window.close();
  });
});

document.getElementById('saveBtn').onclick = () => {
  const listing = {
    ...window.scraped,
    address: document.getElementById('address').value.trim(),
    beds: parseFloat(document.getElementById('beds').value) || 0,
    baths: parseFloat(document.getElementById('baths').value) || 0,
    price: document.getElementById('price').value.trim() || null,
    description: document.getElementById('description').value.trim() || '',
    zip: document.getElementById('zip').value.trim() || '',
    amenities: document.getElementById('amenities').value.split(',').map(s => s.trim()).filter(Boolean),
    notes: document.getElementById('notes').value.trim() || '',
    id: Date.now().toString(),
    order: Date.now(),
    status: "new"
  };
  const needsZipLookup = !listing.zip && listing.address;
  chrome.storage.local.get({ saved: [] }, data => {
    data.saved.push(listing);
    chrome.storage.local.set({ saved: data.saved }, () => {
      if (needsZipLookup) {
        const q = encodeURIComponent(listing.address);
        fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1`)
          .then(r => r.json())
          .then(results => {
            const z = results?.[0]?.address?.postcode || '';
            if (z) {
              const updated = data.saved.map(i => i.id === listing.id ? { ...i, zip: z } : i);
              chrome.storage.local.set({ saved: updated });
            }
          })
          .catch(() => {})
          .finally(() => window.close());
      } else {
        window.close();
      }
    });
  });
};
