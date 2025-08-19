// dashboard.js
const STATUSES = ["new","viewed","contacted","applied","approved","denied"];

function getFilters() {
  const status = document.getElementById('filter')?.value || '';
  const q = (document.getElementById('search')?.value || '').toLowerCase();
  return { status, q };
}

function groupByStatus(items) {
  const groups = Object.fromEntries(STATUSES.map(s => [s, []]));
  for (const item of items) {
    const key = STATUSES.includes(item.status) ? item.status : 'new';
    groups[key].push(item);
  }
  // Within each status: sort by explicit order (if set), else fallback to id desc
  for (const s of STATUSES) {
    groups[s].sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : 0;
      const bo = typeof b.order === 'number' ? b.order : 0;
      if (ao !== bo) return bo - ao; // higher order first (newer at top)
      return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
    });
  }
  return groups;
}

function cardTemplate(item) {
  const price = item.price ? `<span class="muted">${item.price}</span>` : '';
  const amenities = Array.isArray(item.amenities) && item.amenities.length ? item.amenities.join(', ') : '—';
  const topAmenities = Array.isArray(item.amenities) ? item.amenities.slice(0, 3) : [];
  const [street, area] = (() => {
    const full = (item.address || '').trim();
    if (!full) return ['', ''];
    const inMatch = full.match(/^(.*?)\s+in\s+(.+)$/i);
    if (inMatch) return [inMatch[1].trim(), inMatch[2].trim()];
    const areaMatch = full.match(/([^,]+),\s*(Queens|Brooklyn|Manhattan|Bronx|Staten Island)\s*$/i);
    if (areaMatch) {
      const area = `${areaMatch[1].trim()}, ${areaMatch[2]}`;
      const idx = full.toLowerCase().lastIndexOf(area.toLowerCase());
      const street = idx > 0 ? full.slice(0, idx).replace(/[\s,–—-]+$/g, '').trim() : full;
      return [street, area];
    }
    return [full, ''];
  })();
  const areaLine = (() => {
    const base = area ? area : '';
    if (base && item.zip) return `${base} ${item.zip}`;
    if (!base && item.zip) return `${item.zip}`;
    return base;
  })();
  return `
    <div class="card" draggable="true" data-id="${item.id}">
      <div class="card-grid">
        <div class="check-cell"><input class="select-toggle" type="checkbox" data-id="${item.id}" aria-label="Select card" /></div>
        <h3 class="title content-col">${(street || '(no address)')}</h3>
        ${(areaLine) ? `<div class=\"subaddress content-col muted\">${areaLine}</div>` : ''}
        ${price ? `<div class="muted price content-col">${item.price}</div>` : ''}
        <div class="row content-col">
        <span class="badge">${item.beds || 0} bd</span>
        <span class="badge">${item.baths || 0} ba</span>
        ${item.source ? `<a class="badge" href="${item.url}" target="_blank">${item.source}</a>` : ''}
        </div>
        ${topAmenities.length ? `<div class="chips content-col">${topAmenities.map(a => `<span class="chip">${a}</span>`).join('')}</div>` : ''}
        ${item.description ? `<details class="content-col"><summary class="muted">Description</summary><div class="meta">${item.description}</div></details>` : ''}
        <textarea class="notes content-col" data-id="${item.id}" rows="2" placeholder="Notes...">${item.notes || ''}</textarea>
        <div class="actions content-col">
          <button class="btn delete" data-id="${item.id}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function render() {
  chrome.storage.local.get({ saved: [] }, data => {
    const { status, q } = getFilters();
    let items = data.saved.slice();
    if (status) items = items.filter(i => i.status === status);
    if (q) items = items.filter(i =>
      (i.address || '').toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.notes || '').toLowerCase().includes(q)
    );

    const groups = groupByStatus(items);
    const board = document.getElementById('board');
    board.innerHTML = STATUSES.map(s => `
      <div class="column status-${s}" data-status="${s}">
        <div class="column-header">
          <span>${s.charAt(0).toUpperCase() + s.slice(1)}</span>
          <span class="column-count">${groups[s].length}</span>
        </div>
        <div class="column-body" data-dropzone="${s}">
          ${groups[s].map(cardTemplate).join('') || '<div class="muted">No items</div>'}
        </div>
      </div>
    `).join('');

    // Wire: drag & drop
    board.querySelectorAll('.card').forEach(card => {
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.dataset.id);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    board.querySelectorAll('.column-body').forEach(zone => {
      let placeholder = null;
      zone.addEventListener('dragover', e => {
        e.preventDefault();
        zone.parentElement.classList.add('drag-over');
        const dragging = document.querySelector('.card.dragging');
        if (!dragging) return;
        if (!placeholder) {
          placeholder = document.createElement('div');
          placeholder.className = 'card placeholder';
          placeholder.style.height = `${dragging.getBoundingClientRect().height}px`;
          zone.appendChild(placeholder);
        }
        let cards = Array.from(zone.querySelectorAll('.card:not(.placeholder):not(.dragging)'));
        // If empty, allow placing anywhere by tracking relative Y inside the zone
        if (!cards.length) {
          const rect = zone.getBoundingClientRect();
          const offsetY = e.clientY - rect.top;
          // Create spacing blocks to simulate mid/bottom placement
          const topPad = Math.max(0, Math.min(offsetY - dragging.getBoundingClientRect().height / 2, rect.height - dragging.getBoundingClientRect().height));
          placeholder.style.marginTop = `${topPad}px`;
          zone.appendChild(placeholder);
          return;
        } else {
          placeholder.style.marginTop = '';
        }
        let inserted = false;
        for (const c of cards) {
          const rect = c.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            zone.insertBefore(placeholder, c);
            inserted = true;
            break;
          }
        }
        if (!inserted) zone.appendChild(placeholder);
      });
      zone.addEventListener('dragleave', () => {
        zone.parentElement.classList.remove('drag-over');
      });
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.parentElement.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain');
        const newStatus = zone.dataset.dropzone;
        // Determine new order around placeholder position
        const siblings = Array.from(zone.querySelectorAll('.card'));
        const idx = placeholder ? siblings.indexOf(placeholder) : -1;
        const beforeId = idx > -1 && idx < siblings.length - 1 ? siblings[idx + 1]?.dataset?.id : null;
        const itemsInStatus = data.saved.filter(i => i.status === newStatus && i.id !== id);
        const orders = itemsInStatus.map(i => typeof i.order === 'number' ? i.order : 0);
        const maxOrder = orders.length ? Math.max(...orders) : 0;
        const targetOrder = beforeId ? (itemsInStatus.find(i => i.id === beforeId)?.order || maxOrder) + 1 : maxOrder + 1;
        data.saved = data.saved.map(i => i.id === id ? { ...i, status: newStatus, order: targetOrder } : i);
        if (placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
        placeholder = null;
        chrome.storage.local.set({ saved: data.saved }, render);
      });
    });

    // Wire: select, notes & delete
    const updateSelectedUI = () => {
      board.querySelectorAll('.card').forEach(c => {
        const checked = !!c.querySelector('.select-toggle:checked');
        c.classList.toggle('selected', checked);
      });
    };
    board.querySelectorAll('.select-toggle').forEach(cb => {
      cb.addEventListener('change', updateSelectedUI);
    });
    document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => {
      const ids = Array.from(document.querySelectorAll('.select-toggle:checked')).map(el => el.dataset.id);
      if (!ids.length) return;
      if (!confirm(`Delete ${ids.length} selected listing(s)?`)) return;
      chrome.storage.local.get({ saved: [] }, data2 => {
        data2.saved = data2.saved.filter(i => !ids.includes(i.id));
        chrome.storage.local.set({ saved: data2.saved }, render);
      });
    });
    updateSelectedUI();

    // Wire: notes & delete
    board.querySelectorAll('textarea.notes').forEach(area => {
      area.onchange = e => {
        const id = e.target.dataset.id, notes = e.target.value;
        data.saved = data.saved.map(i => i.id === id ? { ...i, notes } : i);
        chrome.storage.local.set({ saved: data.saved });
      };
    });
    board.querySelectorAll('button.delete').forEach(btn => {
      btn.onclick = e => {
        const id = e.target.dataset.id;
        data.saved = data.saved.filter(i => i.id !== id);
        chrome.storage.local.set({ saved: data.saved }, render);
      };
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  render();
  const filter = document.getElementById('filter');
  const search = document.getElementById('search');
  if (filter) filter.onchange = render;
  if (search) search.oninput = () => {
    clearTimeout(window.__searchTimer);
    window.__searchTimer = setTimeout(render, 200);
  };
  // export button removed
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    if (confirm('Clear all saved listings?')) {
      chrome.storage.local.set({ saved: [] }, render);
    }
  });

  // Auto-refresh when listings change in another tab/window
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.saved) {
      render();
    }
  });
});
