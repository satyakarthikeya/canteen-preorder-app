const menuCanteenTitle = document.getElementById('menu-canteen-title');
const menuSearch = document.getElementById('menu-search');
const menuAvailabilityFilter = document.getElementById('menu-availability-filter');
const menuSort = document.getElementById('menu-sort');
const menuList = document.getElementById('menu-list');
const favoritesList = document.getElementById('favorites-list');
const menuMessage = document.getElementById('menu-message');

let canteens = [];
let currentMenu = [];
let selectedCanteenId = window.kbites.getSelectedCanteen();
let favorites = window.kbites.getFavorites();

function getItemQuantityInCart(itemId) {
  const cart = window.kbites.getCart();
  const item = cart.find(row => row.id === itemId);
  return item ? Number(item.quantity || 0) : 0;
}

function getFavoritesForCurrentCanteen() {
  if (!selectedCanteenId) return [];
  return favorites[selectedCanteenId] || [];
}

function persistFavorites() {
  window.kbites.setFavorites(favorites);
}

function toggleFavorite(item) {
  if (!selectedCanteenId) return;
  if (!favorites[selectedCanteenId]) favorites[selectedCanteenId] = [];
  const exists = favorites[selectedCanteenId].some(f => f.id === item.id);
  if (exists) {
    favorites[selectedCanteenId] = favorites[selectedCanteenId].filter(f => f.id !== item.id);
  } else {
    favorites[selectedCanteenId].push({ id: item.id, name: item.name, price: item.price });
  }
  persistFavorites();
  renderFavorites();
  renderMenu();
}

function applyMenuFilters() {
  const searchTerm = menuSearch.value.trim().toLowerCase();
  const availability = menuAvailabilityFilter.value;
  const sort = menuSort.value;

  let result = [...currentMenu];

  if (searchTerm) {
    result = result.filter(item => item.name.toLowerCase().includes(searchTerm));
  }
  if (availability === 'available') {
    result = result.filter(item => item.status === 'available');
  }

  if (sort === 'priceAsc') result.sort((a, b) => a.price - b.price);
  if (sort === 'priceDesc') result.sort((a, b) => b.price - a.price);
  if (sort === 'nameAsc') result.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'popular') {
    const popularity = {};
    const orders = JSON.parse(localStorage.getItem('kbites_orders_cache') || '[]');
    orders.forEach(order => {
      (order.items || []).forEach(item => {
        popularity[item.id] = (popularity[item.id] || 0) + Number(item.quantity || 0);
      });
    });
    result.sort((a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0));
  }

  return result;
}

function renderFavorites() {
  const items = getFavoritesForCurrentCanteen();
  if (!items.length) {
    favoritesList.innerHTML = '<p>No favorites yet for this canteen.</p>';
    return;
  }

  favoritesList.innerHTML = items.map(item => `
    <div class="menu-card">
      <h3>${item.name}</h3>
      <p>Price: ₹${item.price}</p>
      <p class="cart-qty-label">In cart: <strong>${getItemQuantityInCart(item.id)}</strong></p>
      <div class="qty-controls">
        <button type="button" data-fav-action="decrease" data-fav-id="${item.id}" data-fav-name="${item.name}" data-fav-price="${item.price}" ${getItemQuantityInCart(item.id) === 0 ? 'disabled' : ''}>-</button>
        <span class="qty-number">${getItemQuantityInCart(item.id)}</span>
        <button type="button" data-fav-action="increase" data-fav-id="${item.id}" data-fav-name="${item.name}" data-fav-price="${item.price}">+</button>
      </div>
    </div>
  `).join('');

  favoritesList.querySelectorAll('button[data-fav-action]').forEach(button => {
    button.addEventListener('click', () => {
      const item = {
        id: button.dataset.favId,
        name: button.dataset.favName,
        price: Number(button.dataset.favPrice)
      };
      const cart = window.kbites.getCart();
      const existing = cart.find(row => row.id === item.id);
      if (button.dataset.favAction === 'increase') {
        if (existing) {
          existing.quantity += 1;
        } else {
          cart.push({ id: item.id, name: item.name, price: Number(item.price), quantity: 1 });
        }
      } else if (existing) {
        existing.quantity -= 1;
        if (existing.quantity <= 0) {
          const idx = cart.findIndex(row => row.id === item.id);
          if (idx !== -1) cart.splice(idx, 1);
        }
      }
      window.kbites.setCart(cart);
      window.kbites.updateMessage(menuMessage, `${item.name} quantity updated.`);
      renderFavorites();
      renderMenu();
    });
  });
}

function renderMenu() {
  const menu = applyMenuFilters();
  if (!menu.length) {
    menuList.innerHTML = '<p>No items match your filters.</p>';
    return;
  }

  menuList.innerHTML = menu.map(item => {
    const disabled = item.status !== 'available';
    const isFavorite = getFavoritesForCurrentCanteen().some(row => row.id === item.id);
    const qtyInCart = getItemQuantityInCart(item.id);
    return `
      <div class="menu-card">
        <h3>${item.name}</h3>
        <p>Price: ₹${item.price}</p>
        <p>Status: <strong>${item.status}</strong></p>
        <p class="cart-qty-label">In cart: <strong>${qtyInCart}</strong></p>
        <div class="qty-controls">
          <button type="button" data-menu-action="decrease" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}" ${qtyInCart === 0 ? 'disabled' : ''}>-</button>
          <span class="qty-number">${qtyInCart}</span>
          <button type="button" data-menu-action="increase" data-id="${item.id}" data-name="${item.name}" data-price="${item.price}" ${disabled ? 'disabled' : ''}>+</button>
        </div>
        <button type="button" data-fav-id="${item.id}">${isFavorite ? 'Remove Favorite' : 'Add Favorite'}</button>
      </div>
    `;
  }).join('');

  menuList.querySelectorAll('button[data-menu-action]').forEach(button => {
    button.addEventListener('click', () => {
      const cart = window.kbites.getCart();
      const existing = cart.find(row => row.id === button.dataset.id);
      if (button.dataset.menuAction === 'increase') {
        if (existing) {
          existing.quantity += 1;
        } else {
          cart.push({
            id: button.dataset.id,
            name: button.dataset.name,
            price: Number(button.dataset.price),
            quantity: 1
          });
        }
      } else if (existing) {
        existing.quantity -= 1;
        if (existing.quantity <= 0) {
          const idx = cart.findIndex(row => row.id === button.dataset.id);
          if (idx !== -1) cart.splice(idx, 1);
        }
      } else {
        return;
      }

      window.kbites.setCart(cart);
      window.kbites.updateMessage(menuMessage, `${button.dataset.name} quantity updated.`);
      renderFavorites();
      renderMenu();
    });
  });

  menuList.querySelectorAll('button[data-fav-id]').forEach(button => {
    button.addEventListener('click', () => {
      const item = currentMenu.find(row => row.id === button.dataset.favId);
      if (item) toggleFavorite(item);
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

  menuCanteenTitle.textContent = `${canteen.name} • ${canteen.location}`;
  currentMenu = await window.kbites.fetchMenu(selectedCanteenId);
  renderFavorites();
  renderMenu();
}

window.kbites.applyTheme();
init();

menuSearch.addEventListener('input', renderMenu);
menuAvailabilityFilter.addEventListener('change', renderMenu);
menuSort.addEventListener('change', renderMenu);
