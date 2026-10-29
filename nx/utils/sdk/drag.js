export function makeDraggable({
  element, getData, onResult = () => {}, port, request, supported,
}) {
  if (!(element instanceof Element) || typeof getData !== 'function') {
    throw new TypeError('invalid-drag-source');
  }
  const controller = new AbortController();
  const { signal } = controller;
  const original = { draggable: element.getAttribute('draggable'), touchAction: element.style.touchAction };
  let active;
  let finishing;
  let suppressClick = false;
  const point = (event) => ({ x: event.clientX, y: event.clientY });
  const post = (action, details) => {
    try { port.postMessage({ action, details }); } catch { /* disconnected host */ }
  };
  const release = (drag) => {
    cancelAnimationFrame(drag.frame);
    if (element.hasPointerCapture(drag.pointerId)) element.releasePointerCapture(drag.pointerId);
  };
  const cancel = () => {
    const drag = active || finishing;
    if (!drag) return;
    active = undefined;
    finishing = undefined;
    drag.cancelled = true;
    release(drag);
    if (drag.started) {
      drag.started.then((result) => {
        if (result.ok) post('dragCancel', { dragId: result.dragId });
      });
    }
  };
  const settle = (drag, result) => {
    if (drag.reported || drag.cancelled) return;
    drag.reported = true;
    if (active === drag) active = undefined;
    if (finishing === drag) finishing = undefined;
    release(drag);
    onResult(result);
  };
  const move = (drag) => {
    drag.started.then((result) => {
      if (result.ok && active === drag) {
        post('dragMove', { dragId: result.dragId, point: drag.point });
      }
    });
  };
  element.draggable = !supported;
  if (supported) element.style.touchAction = 'none';
  element.addEventListener('dragstart', (event) => {
    if (supported) {
      event.preventDefault();
      return;
    }
    try {
      const { data = {}, files = [] } = getData();
      Object.entries(data).forEach(([type, value]) => event.dataTransfer.setData(type, value));
      files.forEach((file) => event.dataTransfer.items.add(file));
      event.dataTransfer.effectAllowed = 'copy';
    } catch {
      event.preventDefault();
      onResult({ ok: false, error: 'invalid-drag-data' });
    }
  }, { signal });
  if (supported) {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      cancel();
      suppressClick = false;
      active = {
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        origin: point(event),
        point: point(event),
      };
      element.setPointerCapture(event.pointerId);
    }, { signal });
    element.addEventListener('pointermove', (event) => {
      const drag = active;
      if (!drag || event.pointerId !== drag.pointerId) return;
      drag.point = point(event);
      if (!drag.started) {
        if (Math.hypot(drag.point.x - drag.origin.x, drag.point.y - drag.origin.y) < 6) return;
        suppressClick = true;
        try {
          const payload = getData();
          drag.started = request('dragStart', { payload, point: drag.point });
        } catch {
          cancel();
          onResult({ ok: false, error: 'invalid-drag-data' });
          return;
        }
        drag.started.then((result) => {
          if (!result.ok && !drag.cancelled) {
            settle(drag, result);
          } else if (active === drag && drag.pointerType !== 'touch') {
            drag.handedOff = true;
            release(drag);
          }
        });
      }
      event.preventDefault();
      cancelAnimationFrame(drag.frame);
      drag.frame = requestAnimationFrame(() => move(drag));
    }, { signal });
    element.addEventListener('pointerup', async (event) => {
      const drag = active;
      if (!drag || event.pointerId !== drag.pointerId) return;
      active = undefined;
      finishing = drag;
      release(drag);
      if (!drag.started) {
        finishing = undefined;
        return;
      }
      const result = await drag.started;
      if (!result.ok || drag.cancelled) return;
      settle(drag, await request('dragFinish', { dragId: result.dragId, point: point(event) }));
    }, { signal });
    element.addEventListener('pointercancel', cancel, { signal });
    element.addEventListener('lostpointercapture', () => {
      if (!active?.handedOff) cancel();
    }, { signal });
    element.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, { capture: true, signal });
    element.ownerDocument.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') cancel();
    }, { signal });
    window.addEventListener('blur', cancel, { signal });
    window.addEventListener('pagehide', cancel, { signal });
    port.addEventListener('message', ({ data }) => {
      const drag = active || finishing;
      if (data?.action !== 'dragResult' || !drag?.started) return;
      drag.started.then((result) => {
        if (result.ok && result.dragId === data.details?.dragId) {
          settle(drag, data.details.result);
        }
      });
    }, { signal });
    port.start();
  }
  return () => {
    cancel();
    controller.abort();
    if (original.draggable === null) element.removeAttribute('draggable');
    else element.setAttribute('draggable', original.draggable);
    element.style.touchAction = original.touchAction;
  };
}
