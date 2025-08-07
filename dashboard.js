// dashboard.js
function render() {
  chrome.storage.local.get({ saved: [] }, data => {
    let container = document.getElementById('list');
    if (!data.saved.length) {
      container.innerText = "No listings saved yet!";
      return;
    }
    container.innerHTML = data.saved.map(item => `
      <div class="card">
        <h3>${item.address}</h3>
        <p>${item.beds} bed / ${item.baths} bath</p>
        <p>Amenities: ${item.amenities.join(', ') || '—'}</p>
        <p>Source: <a href="${item.url}" target="_blank">${item.source}</a></p>
        <p>Status:
          <select data-id="${item.id}">
            ${["new","contacted","applied","approved","denied"]
              .map(s => `<option ${s===item.status?"selected":""}>${s}</option>`).join('')}
          </select>
        </p>
      </div>
    `).join('');
    // wire up status changes
    container.querySelectorAll('select').forEach(sel => {
      sel.onchange = e => {
        let id = e.target.dataset.id, newStatus = e.target.value;
        data.saved = data.saved.map(i =>
          i.id === id ? { ...i, status: newStatus } : i
        );
        chrome.storage.local.set({ saved: data.saved }, render);
      };
    });
  });
}

document.addEventListener('DOMContentLoaded', render);
