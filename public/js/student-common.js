(function () {
  const STORAGE_KEYS = {
    student: 'kbites_verified_student',
    selectedCanteen: 'kbites_selected_canteen',
    cart: 'kbites_cart',
    favorites: 'kbites_favorites',
    theme: 'kbites_theme'
  };

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function updateMessage(element, message, success = true) {
    if (!element) return;
    if (!message) {
      element.textContent = '';
      element.style.background = 'transparent';
      element.style.color = 'inherit';
      return;
    }
    element.textContent = message;
    element.style.background = success ? '#e8f5e9' : '#ffebee';
    element.style.color = success ? '#1b5e20' : '#b71c1c';
  }

  function applyTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEYS.theme) || 'light';
    document.body.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const current = document.body.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEYS.theme, next);
  }

  function getStudent() {
    return readJson(STORAGE_KEYS.student, null);
  }

  function setStudent(student) {
    writeJson(STORAGE_KEYS.student, student);
  }

  function clearStudent() {
    localStorage.removeItem(STORAGE_KEYS.student);
  }

  function getSelectedCanteen() {
    return localStorage.getItem(STORAGE_KEYS.selectedCanteen) || '';
  }

  function setSelectedCanteen(canteenId) {
    localStorage.setItem(STORAGE_KEYS.selectedCanteen, canteenId);
  }

  function clearSelectedCanteen() {
    localStorage.removeItem(STORAGE_KEYS.selectedCanteen);
  }

  function getCart() {
    return readJson(STORAGE_KEYS.cart, []);
  }

  function setCart(cart) {
    writeJson(STORAGE_KEYS.cart, cart);
  }

  function clearCart() {
    localStorage.removeItem(STORAGE_KEYS.cart);
  }

  function getFavorites() {
    return readJson(STORAGE_KEYS.favorites, {});
  }

  function setFavorites(favorites) {
    writeJson(STORAGE_KEYS.favorites, favorites);
  }

  async function fetchCanteens() {
    const res = await fetch('/api/canteens');
    return res.json();
  }

  async function fetchMenu(canteenId) {
    const res = await fetch(`/api/menu?canteenId=${encodeURIComponent(canteenId)}`);
    return res.json();
  }

  function getCanteenName(canteenId, canteens) {
    const canteen = (canteens || []).find(item => item.id === canteenId);
    return canteen ? canteen.name : canteenId;
  }

  function requireStudent(redirectUrl = 'index.html') {
    if (!getStudent()) {
      window.location.href = redirectUrl;
      return false;
    }
    return true;
  }

  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  window.kbites = {
    storageKeys: STORAGE_KEYS,
    updateMessage,
    applyTheme,
    toggleTheme,
    getStudent,
    setStudent,
    clearStudent,
    getSelectedCanteen,
    setSelectedCanteen,
    clearSelectedCanteen,
    getCart,
    setCart,
    clearCart,
    getFavorites,
    setFavorites,
    fetchCanteens,
    fetchMenu,
    getCanteenName,
    requireStudent,
    requestNotificationPermission
  };
})();
