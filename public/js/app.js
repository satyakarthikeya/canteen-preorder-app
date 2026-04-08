const enterBtn = document.getElementById('enter-btn');
const browseCanteensBtn = document.getElementById('browse-canteens-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const authPanel = document.getElementById('auth-panel');
const welcomePanel = document.getElementById('welcome-panel');
const studentDashboard = document.getElementById('student-dashboard');
const dashboardWelcome = document.getElementById('dashboard-welcome');
const dashboardInfo = document.getElementById('dashboard-info');
const dashboardOrders = document.getElementById('dashboard-orders');
const quickReorder = document.getElementById('quick-reorder');
const authForm = document.getElementById('student-auth-form');
const testMailBtn = document.getElementById('test-mail-btn');
const otpSection = document.getElementById('otp-section');
const otpInput = document.getElementById('otp-code');
const verifyOtpBtn = document.getElementById('verify-otp-btn');
const authMessage = document.getElementById('auth-message');
const otpMessage = document.getElementById('otp-message');
const studentNameInput = document.getElementById('student-name');
const studentEmailInput = document.getElementById('student-email');
const studentIdInput = document.getElementById('student-id');

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
  studentOrders = await res.json();
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
    <p>Use Browse Canteens to move to the next page.</p>
  `;
  loadStudentOrders();
}

authForm.addEventListener('submit', async event => {
  event.preventDefault();
  const name = studentNameInput.value.trim();
  const email = studentEmailInput.value.trim();
  const studentId = studentIdInput.value.trim();

  const res = await fetch('/api/student/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, studentId })
  });
  const result = await res.json();
  window.kbites.updateMessage(authMessage, result.message, result.success);

  if (result.success) {
    show(otpSection);
    window.kbites.updateMessage(otpMessage, 'Enter the OTP sent to your email.');
  }
});

testMailBtn.addEventListener('click', async () => {
  const email = studentEmailInput.value.trim();
  const name = studentNameInput.value.trim();
  if (!email) {
    window.kbites.updateMessage(authMessage, 'Enter email first to send test mail.', false);
    return;
  }

  window.kbites.updateMessage(authMessage, 'Sending test email...');
  const res = await fetch('/api/student/test-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name })
  });
  const result = await res.json();
  window.kbites.updateMessage(authMessage, result.message, result.success);
});

verifyOtpBtn.addEventListener('click', async () => {
  const email = studentEmailInput.value.trim();
  const otp = otpInput.value.trim();
  if (!email || !otp) {
    window.kbites.updateMessage(otpMessage, 'Enter both email and OTP.', false);
    return;
  }

  const res = await fetch('/api/student/verify-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, otp })
  });
  const result = await res.json();
  window.kbites.updateMessage(otpMessage, result.message, result.success);

  if (result.success) {
    verifiedStudent = result.student;
    window.kbites.setStudent(verifiedStudent);
    requestNotificationPermission();
    hide(authPanel);
    show(studentDashboard);
    await loadCanteens();
    updateDashboard();
    startOrderPolling();
    window.kbites.updateMessage(authMessage, `Welcome, ${verifiedStudent.name}! Use Browse Canteens to start ordering.`);
  }
});

enterBtn.addEventListener('click', () => {
  hide(welcomePanel);
  show(authPanel);
});

browseCanteensBtn.addEventListener('click', () => {
  if (!verifiedStudent) {
    window.kbites.updateMessage(authMessage, 'Please complete login first.', false);
    return;
  }
  window.location.href = 'canteens.html';
});

themeToggleBtn.addEventListener('click', window.kbites.toggleTheme);

window.kbites.applyTheme();

if (verifiedStudent) {
  hide(welcomePanel);
  hide(authPanel);
  show(studentDashboard);
  loadCanteens().then(updateDashboard);
  startOrderPolling();
} else {
  hide(studentDashboard);
}
