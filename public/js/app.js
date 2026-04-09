const enterBtn = document.getElementById('enter-btn');
const browseCanteensBtn = document.getElementById('browse-canteens-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const welcomePanel = document.getElementById('welcome-panel');
const customerDetailsPanel = document.getElementById('customer-details-panel');
const customerDetailsForm = document.getElementById('customer-details-form');
const customerNameInput = document.getElementById('customer-name');
const customerPhoneInput = document.getElementById('customer-phone');
const customerCollegeIdInput = document.getElementById('customer-college-id');
const customerEmailInput = document.getElementById('customer-email');
const customerDetailsMessage = document.getElementById('customer-details-message');
const studentDashboard = document.getElementById('student-dashboard');
const dashboardWelcome = document.getElementById('dashboard-welcome');
const dashboardInfo = document.getElementById('dashboard-info');
const dashboardOrders = document.getElementById('dashboard-orders');
const quickReorder = document.getElementById('quick-reorder');

let verifiedStudent = window.kbites.getStudent();
let studentOrders = [];
let canteens = [];
let orderPollIntervalId = null;
const lastSeenOrderStatuses = {};

function show(element) {
  if (!element) return;
  element.classList.remove('hidden');
}

function hide(element) {
  if (!element) return;
  element.classList.add('hidden');
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function prefillCustomerDetails() {
  const existing = window.kbites.getStudent();
  if (!existing) return;
  customerNameInput.value = existing.name || '';
  customerPhoneInput.value = existing.phone || '';
  customerCollegeIdInput.value = existing.studentId || '';
  customerEmailInput.value = existing.email && !String(existing.email).endsWith('@kbites.local') ? existing.email : '';
}

function buildStudentFromForm() {
  const name = customerNameInput.value.trim();
  const phone = normalizePhone(customerPhoneInput.value);
  const studentId = customerCollegeIdInput.value.trim();
  const emailInput = customerEmailInput.value.trim().toLowerCase();

  if (!name || !phone || !studentId) {
    window.kbites.updateMessage(customerDetailsMessage, 'Please enter name, phone number, and college ID.', false);
    return null;
  }
  if (phone.length < 10) {
    window.kbites.updateMessage(customerDetailsMessage, 'Please enter a valid phone number.', false);
    return null;
  }

  const suffix = Date.now();
  const existing = window.kbites.getStudent();
  return {
    id: existing?.id || `STU-${suffix}`,
    name,
    phone,
    email: emailInput || `guest${suffix}@kbites.local`,
    studentId
  };
}

function requestNotificationPermission() {
  window.kbites.requestNotificationPermission();
}

function notifyReadyOrder(order) {
  const text = `Order ${order.id} is ready for pickup. Token: ${order.orderToken || '-'}`;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('K-Bites', { body: text });
  }
  window.kbites.updateMessage(dashboardOrders, text, true);
}

function startOrderPolling() {
  if (orderPollIntervalId) clearInterval(orderPollIntervalId);
  orderPollIntervalId = setInterval(() => {
    if (verifiedStudent) {
      loadStudentOrders();
    }
  }, 10000);
}

function getCanteenName(canteenId) {
  const canteen = canteens.find(item => item.id === canteenId);
  return canteen ? canteen.name : canteenId;
}

async function loadCanteens() {
  canteens = await window.kbites.fetchCanteens();
}

function renderQuickReorder() {
  if (!studentOrders.length) {
    quickReorder.innerHTML = '<p>No previous orders yet for quick reorder.</p>';
    return;
  }

  const latest = studentOrders.slice(0, 3);
  quickReorder.innerHTML = latest.map(order => `
    <div class="order-card">
      <p><strong>${getCanteenName(order.canteenId)}</strong></p>
      <p>${order.items.length} items</p>
      <button data-reorder-id="${order.id}" type="button">Reorder</button>
    </div>
  `).join('');

  quickReorder.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      const order = studentOrders.find(item => item.id === button.dataset.reorderId);
      if (!order) return;
      window.kbites.setSelectedCanteen(order.canteenId);
      window.kbites.setCart(order.items.map(item => ({
        id: item.id,
        name: item.name,
        price: Number(item.price),
        quantity: Number(item.quantity)
      })));
      window.location.href = 'cart.html';
    });
  });
}

async function loadStudentOrders() {
  if (!verifiedStudent) return;
  const res = await fetch(`/api/student/orders?email=${encodeURIComponent(verifiedStudent.email)}`);
  const payload = await res.json();
  studentOrders = Array.isArray(payload) ? payload : [];
  localStorage.setItem('kbites_orders_cache', JSON.stringify(studentOrders));

  studentOrders.forEach(order => {
    const previous = lastSeenOrderStatuses[order.id];
    const current = (order.status || '').toLowerCase();
    if (previous && previous !== current && current === 'ready for pickup') {
      notifyReadyOrder(order);
    }
    lastSeenOrderStatuses[order.id] = current;
  });

  if (!studentOrders.length) {
    dashboardOrders.innerHTML = '<p>No previous orders yet.</p>';
    renderQuickReorder();
    return;
  }

  dashboardOrders.innerHTML = studentOrders.map(order => `
    <div class="order-card">
      <p><strong>Order ID:</strong> ${order.id}</p>
      <p><strong>Canteen:</strong> ${getCanteenName(order.canteenId)}</p>
      <p><strong>Status:</strong> ${order.status}</p>
      <p><strong>Pickup Slot:</strong> ${order.pickupSlot || 'ASAP'}</p>
      <p><strong>Token:</strong> ${order.orderToken || '-'}</p>
      <p><strong>Total:</strong> ₹${order.totalAmount || order.items.reduce((sum, item) => sum + item.price * item.quantity, 0)}</p>
      <ul>${order.items.map(item => `<li>${item.name} x ${item.quantity}</li>`).join('')}</ul>
    </div>
  `).join('');

  renderQuickReorder();
}

function updateDashboard() {
  dashboardWelcome.textContent = `Hello, ${verifiedStudent.name}!`;
  dashboardInfo.innerHTML = `
    <p><strong>Email:</strong> ${verifiedStudent.email}</p>
    <p><strong>Student ID:</strong> ${verifiedStudent.studentId}</p>
    <p>Use Browse Canteens to start ordering instantly.</p>
  `;
  loadStudentOrders();
}

enterBtn.addEventListener('click', () => {
  hide(welcomePanel);
  show(customerDetailsPanel);
  prefillCustomerDetails();
  window.kbites.updateMessage(customerDetailsMessage, '');
});

customerDetailsForm.addEventListener('submit', event => {
  event.preventDefault();
  const student = buildStudentFromForm();
  if (!student) return;
  verifiedStudent = student;
  window.kbites.setStudent(student);
  requestNotificationPermission();
  window.location.href = 'canteens.html';
});

browseCanteensBtn.addEventListener('click', () => {
  if (!verifiedStudent) {
    hide(studentDashboard);
    hide(welcomePanel);
    show(customerDetailsPanel);
    prefillCustomerDetails();
    window.kbites.updateMessage(customerDetailsMessage, 'Please enter customer details first.', false);
    return;
  }
  window.location.href = 'canteens.html';
});

themeToggleBtn.addEventListener('click', window.kbites.toggleTheme);

window.kbites.applyTheme();

if (verifiedStudent) {
  hide(welcomePanel);
  hide(customerDetailsPanel);
  show(studentDashboard);
  loadCanteens().then(updateDashboard);
  startOrderPolling();
} else {
  hide(customerDetailsPanel);
  hide(studentDashboard);
}
