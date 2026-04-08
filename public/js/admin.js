const adminLoginForm = document.getElementById('admin-login-form');
const adminPasswordInput = document.getElementById('admin-password');
const adminMessage = document.getElementById('admin-message');
const adminLoginPanel = document.getElementById('admin-login-panel');
const adminDashboardPanel = document.getElementById('admin-dashboard-panel');
const pendingRequestsList = document.getElementById('pending-requests-list');
const refreshPendingBtn = document.getElementById('refresh-pending-btn');

let adminPassword = '';

function setMessage(element, message, success = true) {
  element.textContent = message || '';
  element.style.background = success ? '#e8f5e9' : '#ffebee';
  element.style.color = success ? '#1b5e20' : '#b71c1c';
}

async function loadPendingRequests() {
  const res = await fetch(`/api/admin/pending-registrations?password=${encodeURIComponent(adminPassword)}`);
  if (!res.ok) {
    const result = await res.json();
    setMessage(adminMessage, result.message || 'Failed to load requests.', false);
    return;
  }

  const requests = await res.json();
  if (!Array.isArray(requests) || !requests.length) {
    pendingRequestsList.innerHTML = '<p>No pending canteen registration requests.</p>';
    return;
  }

  pendingRequestsList.innerHTML = requests.map(request => `
    <div class="order-card">
      <p><strong>Request ID:</strong> ${request.id}</p>
      <p><strong>Owner:</strong> ${request.ownerName}</p>
      <p><strong>Username:</strong> ${request.username}</p>
      <p><strong>Canteen:</strong> ${request.canteenName}</p>
      <p><strong>Location:</strong> ${request.location}</p>
      <p><strong>Requested At:</strong> ${new Date(request.requestedAt).toLocaleString()}</p>
      <button type="button" data-approve-id="${request.id}">Approve</button>
      <button type="button" class="danger-btn" data-reject-id="${request.id}">Reject</button>
    </div>
  `).join('');

  pendingRequestsList.querySelectorAll('button[data-approve-id]').forEach(button => {
    button.addEventListener('click', async () => {
      await reviewRequest(button.dataset.approveId, true);
    });
  });

  pendingRequestsList.querySelectorAll('button[data-reject-id]').forEach(button => {
    button.addEventListener('click', async () => {
      await reviewRequest(button.dataset.rejectId, false);
    });
  });
}

async function reviewRequest(requestId, approve) {
  const endpoint = approve ? '/api/admin/approve-registration' : '/api/admin/reject-registration';
  const body = { password: adminPassword, requestId };

  if (!approve) {
    const reason = window.prompt('Optional rejection reason:');
    if (reason !== null && reason.trim()) {
      body.reason = reason.trim();
    }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await res.json();
  setMessage(adminMessage, result.message, result.success);
  if (result.success) {
    await loadPendingRequests();
  }
}

adminLoginForm.addEventListener('submit', async event => {
  event.preventDefault();
  adminPassword = adminPasswordInput.value.trim();

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: adminPassword })
  });

  const result = await res.json();
  setMessage(adminMessage, result.message, result.success);

  if (result.success) {
    adminLoginPanel.classList.add('hidden');
    adminDashboardPanel.classList.remove('hidden');
    await loadPendingRequests();
  }
});

refreshPendingBtn.addEventListener('click', async () => {
  await loadPendingRequests();
});
