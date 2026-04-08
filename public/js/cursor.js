(() => {
  const supportsFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!supportsFinePointer) return;

  const iconByKind = {
    default: '\u{1F37D}\uFE0F',
    burger: '\u{1F354}',
    cart: '\u{1F6D2}'
  };

  const cursor = document.createElement('div');
  cursor.className = 'kb-cursor';
  cursor.dataset.kind = 'default';

  const icon = document.createElement('span');
  icon.className = 'kb-cursor-icon';
  icon.textContent = iconByKind.default;
  cursor.appendChild(icon);

  document.body.appendChild(cursor);
  document.body.classList.add('has-custom-cursor');

  const setKind = kind => {
    const nextKind = iconByKind[kind] ? kind : 'default';
    if (cursor.dataset.kind === nextKind) return;
    cursor.dataset.kind = nextKind;
    icon.textContent = iconByKind[nextKind];
  };

  const setKindFromTarget = target => {
    if (!(target instanceof Element)) {
      setKind('default');
      return;
    }

    if (target.closest('#cart-items') || target.closest('.cart-item') || target.closest('#cart-total') || target.closest('#place-order-btn')) {
      setKind('cart');
      return;
    }

    if (target.closest('#menu-list') || target.closest('.menu-card') || target.closest('#favorites-list') || target.closest('#menu-canteen-title')) {
      setKind('burger');
      return;
    }

    setKind('default');
  };

  document.addEventListener('mousemove', event => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
    setKindFromTarget(event.target);
  }, { passive: true });

  document.addEventListener('mousedown', () => {
    cursor.classList.add('is-active');
  });

  document.addEventListener('mouseup', () => {
    cursor.classList.remove('is-active');
  });

  document.addEventListener('mouseleave', () => {
    cursor.style.opacity = '0';
  });

  document.addEventListener('mouseenter', () => {
    cursor.style.opacity = '1';
  });
})();
