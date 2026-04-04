type Rotatable = {
  rotate(deltaX: number, deltaY: number): void;
};

export function attachControls(
  canvas: HTMLCanvasElement,
  target: Rotatable,
  canInteract: () => boolean = () => true,
): void {
  function handleKeydown(event: KeyboardEvent): void {
    if (!canInteract()) {
      return;
    }

    const step = 0.12;

    switch (event.key) {
      case "ArrowLeft":
        target.rotate(0, -step);
        event.preventDefault();
        break;
      case "ArrowRight":
        target.rotate(0, step);
        event.preventDefault();
        break;
      case "ArrowUp":
        target.rotate(-step, 0);
        event.preventDefault();
        break;
      case "ArrowDown":
        target.rotate(step, 0);
        event.preventDefault();
        break;
      default:
        break;
    }
  }

  let isDragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function handlePointerDown(event: PointerEvent): void {
    if (!canInteract()) {
      return;
    }

    isDragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    canvas.style.cursor = "grabbing";
    canvas.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!isDragging || !canInteract()) {
      return;
    }

    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;

    lastPointerX = event.clientX;
    lastPointerY = event.clientY;

    target.rotate(deltaY * 0.01, deltaX * 0.01);
  }

  function handlePointerEnd(event: PointerEvent): void {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    canvas.style.cursor = "grab";

    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  window.addEventListener("keydown", handleKeydown);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerEnd);
  canvas.addEventListener("pointercancel", handlePointerEnd);
}
