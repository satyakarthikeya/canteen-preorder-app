const cartItems = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const pickupSlot = document.getElementById('pickup-slot');
const paymentMethod = document.getElementById('payment-method');
const phonePePanel = document.getElementById('phonepe-panel');
const phonePeReference = document.getElementById('phonepe-reference');
const phonePeQr = document.getElementById('phonepe-qr');
const phonePeUpiNote = document.getElementById('phonepe-upi-note');
const placeOrderBtn = document.getElementById('place-order-btn');
const orderMessage = document.getElementById('order-message');
const cartCanteenTitle = document.getElementById('cart-canteen-title');

let verifiedStudent = window.kbites.getStudent();
let selectedCanteenId = window.kbites.getSelectedCanteen();
let cart = window.kbites.getCart();
let canteens = [];
let canteenPaymentSettings = { phonePeUpiId: '', phonePeQrImageUrl: '' };

function buildPhonePeQrFromUpi(upiId) {
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent('K-Bites')}`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiUrl)}`;
}

async function loadCanteenPaymentSettings() {
  if (!selectedCanteenId) return;
  try {
    const res = await fetch(`/api/canteen/payment-settings?canteenId=${encodeURIComponent(selectedCanteenId)}`);
    const data = await res.json();
    canteenPaymentSettings = {
      phonePeUpiId: data.phonePeUpiId || '',
      phonePeQrImageUrl: data.phonePeQrImageUrl || ''
    };
  } catch {
    canteenPaymentSettings = { phonePeUpiId: '', phonePeQrImageUrl: '' };
  }
}

function updatePaymentPanel() {
  const isPhonePe = paymentMethod.value === 'PhonePe';
  if (!phonePePanel) return;
  if (isPhonePe) {
    const { phonePeUpiId, phonePeQrImageUrl } = canteenPaymentSettings;
    if (phonePeQr && phonePeQrImageUrl) {
      phonePeQr.src = phonePeQrImageUrl;
    } else if (phonePeQr && phonePeUpiId) {
      phonePeQr.src = buildPhonePeQrFromUpi(phonePeUpiId);
    }
    if (phonePeUpiNote) {
      phonePeUpiNote.textContent = phonePeUpiId ? `Pay to UPI: ${phonePeUpiId}` : 'Owner has not configured UPI ID yet.';
    }
    phonePePanel.classList.remove('hidden');
  } else {
    phonePePanel.classList.add('hidden');
    if (phonePeReference) phonePeReference.value = '';
  }
}

function renderCart() {
  if (!cart.length) {
    cartItems.innerHTML = '<p>No items added yet.</p>';
    cartTotal.textContent = '';
    return;
  }

  cartItems.innerHTML = cart.map(item => `
    <div class="cart-item">
      <span>${item.name} x ${item.quantity} = ₹${item.price * item.quantity}</span>
      <div class="qty-controls">
        <button type="button" data-action="decrease" data-id="${item.id}">-</button>
        <span class="qty-number">${item.quantity}</span>
        <button type="button" data-action="increase" data-id="${item.id}">+</button>
        <button type="button" class="danger-btn" data-action="remove" data-id="${item.id}">Remove</button>
      </div>
    </div>
  `).join('');

  cartTotal.textContent = `Total: ₹${cart.reduce((sum, item) => sum + item.price * item.quantity, 0)}`;

  cartItems.querySelectorAll('button[data-id]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const action = button.dataset.action;
      const idx = cart.findIndex(item => item.id === id);
      if (idx === -1) return;

      if (action === 'increase') {
        cart[idx].quantity += 1;
      } else if (action === 'decrease') {
        cart[idx].quantity -= 1;
        if (cart[idx].quantity <= 0) {
          cart.splice(idx, 1);
        }
      } else if (action === 'remove') {
        cart.splice(idx, 1);
      }

      window.kbites.setCart(cart);
      renderCart();
    });
  });
}

async function init() {
  if (!window.kbites.requireStudent()) return;
  if (!selectedCanteenId) {
    window.location.href = 'canteens.html';
    return;
  }

  window.kbites.applyTheme();
  canteens = await window.kbites.fetchCanteens();
  const canteen = canteens.find(item => item.id === selectedCanteenId);
  if (!canteen) {
    window.location.href = 'canteens.html';
    return;
  }

  cartCanteenTitle.textContent = `${canteen.name} • ${canteen.location}`;
  await loadCanteenPaymentSettings();
  renderCart();
  updatePaymentPanel();
}

placeOrderBtn.addEventListener('click', async () => {
  verifiedStudent = window.kbites.getStudent();
  selectedCanteenId = window.kbites.getSelectedCanteen();
  cart = window.kbites.getCart();

  if (!verifiedStudent || !selectedCanteenId || cart.length === 0) {
    window.kbites.updateMessage(orderMessage, 'Select a canteen and add items to cart first.', false);
    return;
  }

  if (paymentMethod.value === 'PhonePe' && !String(phonePeReference?.value || '').trim()) {
    window.kbites.updateMessage(orderMessage, 'Enter PhonePe transaction ID after payment.', false);
    return;
  }

  if (paymentMethod.value === 'PhonePe' && !canteenPaymentSettings.phonePeUpiId && !canteenPaymentSettings.phonePeQrImageUrl) {
    window.kbites.updateMessage(orderMessage, 'Owner has not configured PhonePe scanner yet. Choose Cash for now.', false);
    return;
  }

  window.kbites.updateMessage(orderMessage, 'Placing order...');
  const res = await fetch('/api/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student: verifiedStudent,
      canteenId: selectedCanteenId,
      items: cart,
      pickupSlot: pickupSlot.value,
      paymentMethod: paymentMethod.value,
      phonePeReference: String(phonePeReference?.value || '').trim()
    })
  });
  const result = await res.json();
  window.kbites.updateMessage(orderMessage, result.message, result.success);
  if (result.success) {
    window.kbites.clearCart();
    localStorage.setItem('kbites_orders_cache', JSON.stringify([result.order].concat(JSON.parse(localStorage.getItem('kbites_orders_cache') || '[]'))));
    window.location.href = 'index.html';
  }
});

window.kbites.applyTheme();
paymentMethod.addEventListener('change', updatePaymentPanel);
init();
