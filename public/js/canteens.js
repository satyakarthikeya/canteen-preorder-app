const canteenSearch = document.getElementById('canteen-search');
const canteenList = document.getElementById('canteen-list');
const canteenMessage = document.getElementById('canteen-message');

let canteens = [];

function showCanteens() {
  const searchTerm = canteenSearch.value.trim().toLowerCase();
  const filtered = canteens.filter(canteen => {
    return canteen.name.toLowerCase().includes(searchTerm) || canteen.location.toLowerCase().includes(searchTerm);
  });

  if (!filtered.length) {
    canteenList.innerHTML = '<p>No canteens found.</p>';
    return;
  }

  canteenList.innerHTML = filtered.map(canteen => `
    <div class="canteen-card">
      <h3>${canteen.name}</h3>
      <p>${canteen.location}</p>
      <p>Status: <strong>${canteen.status}</strong></p>
      <button type="button" data-id="${canteen.id}">Select this canteen</button>
    </div>
  `).join('');

  canteenList.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      if (!window.kbites.requireStudent()) return;
      window.kbites.setSelectedCanteen(button.dataset.id);
      window.kbites.updateMessage(canteenMessage, 'Canteen selected. Moving to menu...');
      window.location.href = 'menu.html';
    });
  });
}

async function init() {
  if (!window.kbites.requireStudent()) return;
  window.kbites.applyTheme();
  canteens = await window.kbites.fetchCanteens();
  showCanteens();
}

window.kbites.applyTheme();
init();

canteenSearch.addEventListener('input', showCanteens);
