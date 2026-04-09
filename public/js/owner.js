const registerPanel = document.getElementById('register-panel');
const registerForm = document.getElementById('owner-register-form');
const registerMessage = document.getElementById('register-message');
const addItemForm = document.getElementById('owner-add-item-form');
const newItemNameInput = document.getElementById('new-item-name');
const newItemPriceInput = document.getElementById('new-item-price');
const exportMenuCsvBtn = document.getElementById('export-menu-csv-btn');
const menuCsvInput = document.getElementById('menu-csv-input');
const importMenuCsvBtn = document.getElementById('import-menu-csv-btn');
const menuImageInput = document.getElementById('menu-image-input');
const extractMenuBtn = document.getElementById('extract-menu-btn');
const extractedMenuPreview = document.getElementById('extracted-menu-preview');
const importExtractedMenuBtn = document.getElementById('import-extracted-menu-btn');
const updateCanteenForm = document.getElementById('owner-update-canteen-form');
const updateCanteenNameInput = document.getElementById('update-canteen-name');
const updateCanteenLocationInput = document.getElementById('update-canteen-location');
const ownerPaymentForm = document.getElementById('owner-payment-form');
const phonePeUpiIdInput = document.getElementById('phonepe-upi-id');
const phonePeQrUrlInput = document.getElementById('phonepe-qr-url');
const ownerBestSeller = document.getElementById('owner-bestseller');
const ownerMetrics = document.getElementById('owner-metrics');
const ownerForm = document.getElementById('owner-login-form');
const ownerMessage = document.getElementById('owner-message');
const dashboardPanel = document.getElementById('dashboard-panel');
const ownerNameLabel = document.getElementById('owner-name');
const ownerCanteenStatus = document.getElementById('owner-canteen-status');
const ownerMenuList = document.getElementById('owner-menu-list');
const ownerOrders = document.getElementById('owner-orders');
const toggleStatusBtn = document.getElementById('toggle-status-btn');

let currentOwner = null;
let canteenStatus = 'closed';
let extractedItems = [];

function setMessageStyles(element, success) {
  element.style.background = success ? '#e8f5e9' : '#ffebee';
  element.style.color = success ? '#1b5e20' : '#b71c1c';
}

function renderExtractedItems() {
  if (!extractedItems.length) {
    extractedMenuPreview.innerHTML = '';
    importExtractedMenuBtn.classList.add('hidden');
    return;
  }

  extractedMenuPreview.innerHTML = `
    <h5>Review Extracted Items</h5>
    <div class="extracted-items-grid">
      ${extractedItems.map((item, index) => `
        <div class="extracted-item-card">
          <label>Item Name
            <input type="text" data-extract-name="${index}" value="${item.name}" />
          </label>
          <label>Price
            <input type="number" min="1" data-extract-price="${index}" value="${item.price}" />
          </label>
          <button type="button" class="danger-btn" data-remove-extract="${index}">Remove</button>
        </div>
      `).join('')}
    </div>
  `;

  importExtractedMenuBtn.classList.remove('hidden');

  extractedMenuPreview.querySelectorAll('input[data-extract-name]').forEach(input => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.extractName);
      if (Number.isNaN(index) || !extractedItems[index]) return;
      extractedItems[index].name = input.value.trim();
    });
  });

  extractedMenuPreview.querySelectorAll('input[data-extract-price]').forEach(input => {
    input.addEventListener('input', () => {
      const index = Number(input.dataset.extractPrice);
      if (Number.isNaN(index) || !extractedItems[index]) return;
      extractedItems[index].price = Number(input.value);
    });
  });

  extractedMenuPreview.querySelectorAll('button[data-remove-extract]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeExtract);
      if (Number.isNaN(index)) return;
      extractedItems = extractedItems.filter((_, rowIndex) => rowIndex !== index);
      renderExtractedItems();
    });
  });
}

registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const ownerName = document.getElementById('register-owner-name').value.trim();
  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value.trim();
  const canteenName = document.getElementById('register-canteen-name').value.trim();
  const location = document.getElementById('register-canteen-location').value.trim();

  const res = await fetch('/api/owner-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerName, username, password, canteenName, location })
  });
  const result = await res.json();
  registerMessage.textContent = result.message || (result.success ? 'Registration request submitted.' : 'Registration failed.');
  setMessageStyles(registerMessage, result.success);

  if (result.success) {
    registerForm.reset();
  }
});

ownerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('owner-username').value.trim();
  const password = document.getElementById('owner-password').value.trim();

  const res = await fetch('/api/owner-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message || (result.success ? 'Login successful.' : 'Login failed.');

  if (result.success) {
    currentOwner = { ownerId: result.ownerId, name: result.name };
    ownerNameLabel.textContent = `Logged in as: ${result.name}`;
    setMessageStyles(ownerMessage, true);
    dashboardPanel.classList.remove('hidden');
    ownerForm.parentElement.classList.add('hidden');
    registerPanel.classList.add('hidden');
    await refreshDashboard();
  } else {
    setMessageStyles(ownerMessage, false);
  }
});

async function refreshDashboard() {
  await Promise.all([
    loadCanteenStatus(),
    loadOwnerPaymentSettings(),
    loadOwnerMenu(),
    loadOrders(),
    loadBestSellerAnalytics(),
    loadMetrics()
  ]);
}

async function loadOwnerPaymentSettings() {
  if (!currentOwner) return;
  const res = await fetch(`/api/owner/payment-settings?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const data = await res.json();
  phonePeUpiIdInput.value = data.phonePeUpiId || '';
  phonePeQrUrlInput.value = data.phonePeQrImageUrl || '';
}

async function loadMetrics() {
  if (!currentOwner) return;
  const res = await fetch(`/api/owner/metrics?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const metrics = await res.json();
  ownerMetrics.innerHTML = `
    <div class="order-card">
      <p><strong>Total Orders</strong></p>
      <p>${metrics.totalOrders || 0}</p>
    </div>
    <div class="order-card">
      <p><strong>Total Revenue</strong></p>
      <p>₹${metrics.totalRevenue || 0}</p>
    </div>
    <div class="order-card">
      <p><strong>Accepted</strong></p>
      <p>${metrics.acceptedOrders || 0}</p>
    </div>
    <div class="order-card">
      <p><strong>Preparing</strong></p>
      <p>${metrics.preparingOrders || 0}</p>
    </div>
    <div class="order-card">
      <p><strong>Ready for Pickup</strong></p>
      <p>${metrics.readyOrders || 0}</p>
    </div>
  `;
}

async function loadCanteenStatus() {
  const res = await fetch(`/api/owner/status?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const canteen = await res.json();
  canteenStatus = canteen.status;
  ownerCanteenStatus.innerHTML = `<p>${canteen.name} is currently <strong>${canteen.status}</strong>.</p>`;
  updateCanteenNameInput.value = canteen.name || '';
  updateCanteenLocationInput.value = canteen.location || '';
  toggleStatusBtn.textContent = canteen.status === 'open' ? 'Mark Closed' : 'Mark Open';
}

async function loadOwnerMenu() {
  const res = await fetch(`/api/owner/menu?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const menu = await res.json();
  ownerMenuList.innerHTML = menu.map(item => {
    return `
      <div class="menu-card">
        <h3>${item.name}</h3>
        <p>Price: ₹${item.price}</p>
        <p>Status: <strong>${item.status}</strong></p>
        <button data-id="${item.id}" data-status="${item.status === 'available' ? 'unavailable' : 'available'}">
          Mark ${item.status === 'available' ? 'Out of stock' : 'Available'}
        </button>
        <button data-delete-id="${item.id}" class="danger-btn">Delete Item</button>
      </div>
    `;
  }).join('');
  ownerMenuList.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.dataset.id) {
        updateItemStatus(button.dataset.id, button.dataset.status);
        return;
      }
      if (button.dataset.deleteId) {
        await deleteMenuItem(button.dataset.deleteId);
      }
    });
  });
}

async function updateItemStatus(itemId, status) {
  const res = await fetch('/api/owner/update-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, itemId, status })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadOwnerMenu();
    await loadBestSellerAnalytics();
    await loadMetrics();
  }
}

async function deleteMenuItem(itemId) {
  const res = await fetch('/api/owner/delete-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, itemId })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadOwnerMenu();
    await loadBestSellerAnalytics();
    await loadMetrics();
  }
}

addItemForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before adding menu items.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const name = newItemNameInput.value.trim();
  const price = Number(newItemPriceInput.value);

  const res = await fetch('/api/owner/add-item', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, name, price })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);

  if (result.success) {
    addItemForm.reset();
    await loadOwnerMenu();
    await loadBestSellerAnalytics();
    await loadMetrics();
  }
});

exportMenuCsvBtn.addEventListener('click', async () => {
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before exporting menu CSV.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const url = `/api/owner/export-menu-csv?ownerId=${encodeURIComponent(currentOwner.ownerId)}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = 'menu-export.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  ownerMessage.textContent = 'CSV export started.';
  setMessageStyles(ownerMessage, true);
});

importMenuCsvBtn.addEventListener('click', async () => {
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before importing CSV.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const file = menuCsvInput.files && menuCsvInput.files[0];
  if (!file) {
    ownerMessage.textContent = 'Please choose a CSV file first.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const formData = new FormData();
  formData.append('ownerId', currentOwner.ownerId);
  formData.append('file', file);

  const res = await fetch('/api/owner/import-menu-csv', {
    method: 'POST',
    body: formData
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);

  if (result.success) {
    menuCsvInput.value = '';
    await loadOwnerMenu();
    await loadBestSellerAnalytics();
    await loadMetrics();
  }
});

extractMenuBtn.addEventListener('click', async () => {
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before extracting menu items.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const file = menuImageInput.files && menuImageInput.files[0];
  if (!file) {
    ownerMessage.textContent = 'Please choose a menu image first.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  ownerMessage.textContent = 'Extracting items from image. This may take a few seconds...';
  setMessageStyles(ownerMessage, true);

  const formData = new FormData();
  formData.append('ownerId', currentOwner.ownerId);
  formData.append('image', file);

  const res = await fetch('/api/owner/extract-menu-from-image', {
    method: 'POST',
    body: formData
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);

  if (result.success) {
    extractedItems = (result.items || []).map(item => ({
      name: String(item.name || '').trim(),
      price: Number(item.price)
    }));
    renderExtractedItems();
  }
});

importExtractedMenuBtn.addEventListener('click', async () => {
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before importing menu items.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const validItems = extractedItems
    .map(item => ({
      name: String(item.name || '').trim(),
      price: Number(item.price)
    }))
    .filter(item => item.name && Number.isFinite(item.price) && item.price > 0);

  if (!validItems.length) {
    ownerMessage.textContent = 'No valid extracted items to import.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const res = await fetch('/api/owner/import-extracted-menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, items: validItems })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);

  if (result.success) {
    extractedItems = [];
    if (menuImageInput) menuImageInput.value = '';
    renderExtractedItems();
    await loadOwnerMenu();
    await loadBestSellerAnalytics();
    await loadMetrics();
  }
});

updateCanteenForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before updating canteen details.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const name = updateCanteenNameInput.value.trim();
  const location = updateCanteenLocationInput.value.trim();

  const res = await fetch('/api/owner/update-canteen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, name, location })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadCanteenStatus();
  }
});

ownerPaymentForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentOwner) {
    ownerMessage.textContent = 'Please login before updating payment settings.';
    setMessageStyles(ownerMessage, false);
    return;
  }

  const phonePeUpiId = phonePeUpiIdInput.value.trim();
  const phonePeQrImageUrl = phonePeQrUrlInput.value.trim();

  const res = await fetch('/api/owner/update-payment-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerId: currentOwner.ownerId,
      phonePeUpiId,
      phonePeQrImageUrl
    })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadOwnerPaymentSettings();
  }
});

async function loadBestSellerAnalytics() {
  if (!currentOwner) return;
  const res = await fetch(`/api/owner/bestseller?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const data = await res.json();

  if (!data.bestSeller) {
    ownerBestSeller.innerHTML = '<p>No order data yet. Best seller will appear after student orders.</p>';
    return;
  }

  ownerBestSeller.innerHTML = `
    <p><strong>Top Item:</strong> ${data.bestSeller.name}</p>
    <p><strong>Units Sold:</strong> ${data.bestSeller.quantity}</p>
    <p><strong>Total Orders:</strong> ${data.totalOrders}</p>
    <p><strong>Top 5 Items:</strong></p>
    <ul>${(data.topItems || []).map(item => `<li>${item.name} - ${item.quantity}</li>`).join('')}</ul>
  `;
}

async function loadOrders() {
  const res = await fetch(`/api/owner/orders?ownerId=${encodeURIComponent(currentOwner.ownerId)}`);
  const orders = await res.json();
  if (!Array.isArray(orders)) {
    ownerOrders.innerHTML = `<p>${orders.message || 'Unable to retrieve orders.'}</p>`;
    return;
  }
  ownerOrders.innerHTML = orders.length ? orders.map(order => {
    const canMarkReady = order.status !== 'ready for pickup' && order.status !== 'picked up';
    const canMarkPickedUp = order.status === 'ready for pickup';
    return `
      <div class="order-card">
        <p><strong>Order ID:</strong> ${order.id}</p>
        <p><strong>Student:</strong> ${order.student.name} (${order.student.email})</p>
        <p><strong>Payment:</strong> ${order.paymentMethod}</p>
        <p><strong>Status:</strong> ${order.status}</p>
        <p><strong>Token:</strong> ${order.orderToken || '-'}</p>
        <p><strong>Items:</strong></p>
        <ul>${order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('')}</ul>
        ${canMarkReady ? `<button data-order-ready="${order.id}">Food Ready</button>` : ''}
        ${canMarkPickedUp ? `<button data-order-picked="${order.id}">Mark Picked Up</button>` : ''}
      </div>
    `;
  }).join('') : '<p>No orders yet.</p>';

  ownerOrders.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.dataset.orderReady) {
        await updateOrderStatus(button.dataset.orderReady, 'ready for pickup');
      }
      if (button.dataset.orderPicked) {
        await updateOrderStatus(button.dataset.orderPicked, 'picked up');
      }
    });
  });
}

async function updateOrderStatus(orderId, status) {
  const res = await fetch('/api/owner/update-order-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, orderId, status })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadOrders();
    await loadMetrics();
  }
}

toggleStatusBtn.addEventListener('click', async () => {
  const newStatus = canteenStatus === 'open' ? 'closed' : 'open';
  const res = await fetch('/api/owner/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerId: currentOwner.ownerId, status: newStatus })
  });
  const result = await res.json();
  ownerMessage.textContent = result.message;
  setMessageStyles(ownerMessage, result.success);
  if (result.success) {
    await loadCanteenStatus();
  }
});
