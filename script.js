(() => {
  const stage = document.querySelector('#stage');
  const openButton = document.querySelector('#open-box');
  const instruction = document.querySelector('#instruction');
  const itemNavigation = document.querySelector('#item-navigation');
  const status = document.querySelector('#stage-status');
  const overlay = document.querySelector('#focus-overlay');
  const closeButton = document.querySelector('#focus-close');
  const slot = document.querySelector('#focus-object-slot');
  const flyer = document.querySelector('#flyer');
  const cutout = document.querySelector('#flyer-cutout');
  const flyerImage = flyer.querySelector('img');
  const title = document.querySelector('#item-title');
  const description = document.querySelector('#item-description');
  const background = [document.querySelector('.concept-note'), document.querySelector('header'), document.querySelector('main'), document.querySelector('footer')];
  const boxImage = stage.querySelector('.box-image');
  const items = {
    dominoes: { title: 'The dominoes', description: 'A little invitation to gather around the table and enjoy a game together. This piece is shown as an illustrative placeholder.', crop: {x: 8.5, y: 10, w: 22.4, h: 22} },
    parcel: { title: 'The wrapped parcel', description: 'A small surprise, waiting to be discovered. This is an illustrative placeholder; its contents have not been specified.', crop: {x: 35, y: 6, w: 29, h: 24} },
    book: { title: 'The recipe book', description: 'A place for recipes and the stories that travel with them. The book shown here is an illustrative placeholder.', crop: {x: 68.5, y: 7, w: 23.7, h: 26.3} },
    bowl: { title: 'The bowl', description: 'An illustrative bowl included to explore how an object could be presented within the box.', crop: {x: 6.5, y: 35.8, w: 25.5, h: 26} },
    textile: { title: 'The textile', description: 'An illustrative textile, shown as a placeholder for an item in the collection.', crop: {x: 67, y: 35.5, w: 28, h: 29} },
    card: { title: 'The card', description: 'An illustrative card, included as a placeholder for a personal detail within the gift.', crop: {x: 6, y: 64, w: 30.5, h: 30} },
    jar: { title: 'The jar', description: 'An illustrative jar shown to demonstrate how another object could be explored.', crop: {x: 39, y: 65, w: 23, h: 28} },
    token: { title: 'The keepsake', description: 'An illustrative keepsake, included as a placeholder for a final item in the box.', crop: {x: 68, y: 68, w: 23, h: 22} }
  };
  let selected = null;
  let lastTrigger = null;
  let hideTimer = null;
  let frame = null;
  let liftedPiece = null;
  let returning = false;
  let returnCleanup = null;
  let returningKey = null;
  let resizeFrame = null;
  const boxPieces = new Map();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // The preview begins with the complete, static image as a no-JS and loading
  // fallback. Once both image assets are decoded, swap in the empty tray and
  // individual pieces in one paint so each piece can leave its compartment.
  async function prepareBoxPieces() {
    const empty = new Image();
    const sheet = new Image();
    empty.src = 'assets/giftbox-empty.png';
    sheet.src = 'assets/giftbox-items.png';
    try {
      await Promise.all([empty.decode(), sheet.decode()]);
    } catch {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [key, item] of Object.entries(items)) {
      const {x, y, w, h} = item.crop;
      const piece = document.createElement('span');
      const image = document.createElement('img');
      piece.className = 'box-piece';
      piece.dataset.piece = key;
      piece.setAttribute('aria-hidden', 'true');
      piece.style.left = `${x}%`;
      piece.style.top = `${y}%`;
      piece.style.width = `${w}%`;
      piece.style.height = `${h}%`;
      image.src = sheet.src;
      image.alt = '';
      image.style.width = `${10000 / w}%`;
      image.style.height = `${10000 / h}%`;
      image.style.left = `${-100 * x / w}%`;
      image.style.top = `${-100 * y / h}%`;
      piece.append(image);
      fragment.append(piece);
      boxPieces.set(key, piece);
    }
    boxImage.src = empty.src;
    boxImage.after(fragment);
    // If the visitor opened an item during loading, keep its source hidden.
    if (selected && boxPieces.has(selected)) {
      liftedPiece = boxPieces.get(selected);
      liftedPiece.classList.add('is-lifted');
    }
  }
  prepareBoxPieces();

  function restoreLiftedPiece() {
    if (liftedPiece) liftedPiece.classList.remove('is-lifted');
    liftedPiece = null;
  }
  const hitCanvas = document.createElement('canvas');
  const hitContext = hitCanvas.getContext('2d', {willReadFrequently: true});
  let hitReady = false;
  function prepareHitMap() {
    if (!flyerImage.naturalWidth || !hitContext) return;
    hitCanvas.width = flyerImage.naturalWidth;
    hitCanvas.height = flyerImage.naturalHeight;
    hitContext.drawImage(flyerImage, 0, 0);
    hitReady = true;
  }
  if (flyerImage.complete) prepareHitMap();
  else flyerImage.addEventListener('load', prepareHitMap, {once: true});
  function hitObject(event) {
    if (!cutout.contains(event.target) || !hitReady) return false;
    const image = flyerImage.getBoundingClientRect();
    const x = Math.floor((event.clientX - image.left) / image.width * hitCanvas.width);
    const y = Math.floor((event.clientY - image.top) / image.height * hitCanvas.height);
    if (x < 0 || y < 0 || x >= hitCanvas.width || y >= hitCanvas.height) return false;
    try { return hitContext.getImageData(x, y, 1, 1).data[3] > 20; }
    catch { return true; }
  }

  function positionFlyer(crop) {
    const scene = stage.getBoundingClientRect();
    const destination = slot.getBoundingClientRect();
    const source = {
      left: scene.left + scene.width * crop.x / 100,
      top: scene.top + scene.height * crop.y / 100,
      width: scene.width * crop.w / 100,
      height: scene.height * crop.h / 100
    };
    flyer.style.left = `${source.left}px`;
    flyer.style.top = `${source.top}px`;
    flyer.style.width = `${source.width}px`;
    flyer.style.height = `${source.height}px`;
    flyerImage.style.width = `${10000 / crop.w}%`;
    flyerImage.style.height = `${10000 / crop.h}%`;
    flyerImage.style.left = `${-100 * crop.x / crop.w}%`;
    flyerImage.style.top = `${-100 * crop.y / crop.h}%`;
    const scale = Math.min(destination.width / source.width, destination.height / source.height);
    const x = destination.left + (destination.width - source.width * scale) / 2 - source.left;
    const y = destination.top + (destination.height - source.height * scale) / 2 - source.top;
    flyer.style.setProperty('--move-x', `${x}px`);
    flyer.style.setProperty('--move-y', `${y}px`);
    flyer.style.setProperty('--scale', scale);
  }

  function finishReturn(name) {
    if (!returning) return;
    returning = false;
    returningKey = null;
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
    clearTimeout(hideTimer);
    hideTimer = null;
    if (returnCleanup) returnCleanup();
    returnCleanup = null;
    flyer.style.removeProperty('transition');
    flyer.style.removeProperty('transform');
    // Swap the moving cutout for its identical in-box layer in one paint.
    restoreLiftedPiece();
    overlay.hidden = true;
    // Removing the scroll lock can change the page width. Keep it until the
    // object has landed so the tray cannot shift underneath the animation.
    document.body.classList.remove('focus-open');
    background.forEach(element => { element.inert = false; });
    document.querySelectorAll('.hotspot').forEach(button => { button.disabled = stage.dataset.state !== 'open'; });
    status.textContent = `${name} returned to the box.`;
    if (lastTrigger) lastTrigger.focus({preventScroll: true});
  }

  function closeItem() {
    if (!selected || returning) return;
    const name = items[selected].title;
    returningKey = selected;
    const entranceStarted = overlay.classList.contains('is-active');
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    selected = null;
    returning = true;
    // The stylesheet restores the cutout to the exact source rectangle.
    // Listen for the actual end instead of racing the browser's first frame
    // with a timeout equal to the transition duration.
    const onEnd = event => {
      if (event.target === flyer && event.propertyName === 'transform') finishReturn(name);
    };
    flyer.addEventListener('transitionend', onEnd);
    returnCleanup = () => flyer.removeEventListener('transitionend', onEnd);
    overlay.classList.remove('is-active');
    if (reducedMotion.matches || !entranceStarted) {
      finishReturn(name);
    } else {
      // A transition can be cancelled by a browser or a preference change.
      hideTimer = setTimeout(() => finishReturn(name), 800);
    }
  }

  function selectItem(key, trigger) {
    if (stage.dataset.state !== 'open' || !items[key] || selected || returning) return;
    clearTimeout(hideTimer);
    // A new selection can interrupt the return animation; restore its source
    // before switching to the next piece so nothing is left missing.
    restoreLiftedPiece();
    selected = key;
    lastTrigger = trigger;
    overlay.hidden = false;
    overlay.classList.remove('is-active');
    title.textContent = items[key].title;
    description.textContent = items[key].description;
    flyer.dataset.item = key;
    document.body.classList.add('focus-open');
    background.forEach(element => { element.inert = true; });
    document.querySelectorAll('.hotspot').forEach(button => { button.disabled = true; });
    positionFlyer(items[key].crop);
    liftedPiece = boxPieces.get(key) || null;
    if (liftedPiece) liftedPiece.classList.add('is-lifted');
    // Commit the starting position before moving the object into the spotlight.
    flyer.getBoundingClientRect();
    frame = requestAnimationFrame(() => { overlay.classList.add('is-active'); frame = null; });
    status.textContent = `${items[key].title} brought forward for a closer look.`;
    closeButton.focus({preventScroll: true});
  }

  function setBox(open) {
    if (!open) closeItem();
    stage.dataset.state = open ? 'open' : 'closed';
    openButton.setAttribute('aria-expanded', String(open));
    openButton.innerHTML = open ? 'Close the box <span aria-hidden="true">↙</span>' : 'Open the box <span aria-hidden="true">↗</span>';
    instruction.textContent = open ? 'Choose any piece to explore it up close.' : 'A little something for the moments that matter.';
    itemNavigation.hidden = !open;
    document.querySelectorAll('.hotspot').forEach(button => { button.disabled = !open; });
    status.textContent = open ? 'The box is open. Choose an item to explore.' : 'The box is closed.';
  }

  openButton.addEventListener('click', () => setBox(stage.dataset.state !== 'open'));
  document.querySelectorAll('[data-item]').forEach(button => button.addEventListener('click', () => selectItem(button.dataset.item, button)));
  overlay.addEventListener('click', event => { if (!hitObject(event)) closeItem(); });
  document.addEventListener('keydown', event => {
    if (!selected) return;
    if (event.key === 'Escape') { event.preventDefault(); closeItem(); }
    if (event.key === 'Tab') { event.preventDefault(); closeButton.focus(); }
  });
  window.addEventListener('resize', () => {
    if (selected) {
      positionFlyer(items[selected].crop);
    } else if (returning && returningKey) {
      // Keep the cutout at its current screen position while its source
      // rectangle moves, then continue towards the new source position.
      const current = flyer.getBoundingClientRect();
      const key = returningKey;
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      flyer.style.transition = 'none';
      positionFlyer(items[key].crop);
      const source = boxPieces.get(key)?.getBoundingClientRect();
      if (!source || !source.width) return;
      const scale = current.width / source.width;
      flyer.style.transform = `translate(${current.left - source.left}px, ${current.top - source.top}px) scale(${scale})`;
      flyer.getBoundingClientRect();
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        if (!returning) return;
        flyer.style.transition = 'transform 520ms var(--ease)';
        flyer.style.transform = 'translate(0px, 0px) scale(1)';
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => finishReturn(items[key].title), 800);
      });
    }
  });
})();
