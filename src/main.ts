import { Renderer } from "./renderer";

const canvas = document.createElement("canvas");
const status = document.createElement("p");

Object.assign(document.body.style, {
  margin: "0",
  minHeight: "100vh",
  overflow: "hidden",
  backgroundColor: "#090b16",
  color: "#d8e1ff",
  fontFamily: "monospace",
});

Object.assign(canvas.style, {
  display: "block",
  width: "100vw",
  height: "100vh",
  cursor: "grab",
});

Object.assign(status.style, {
  position: "fixed",
  inset: "24px auto auto 24px",
  margin: "0",
  padding: "12px 14px",
  maxWidth: "320px",
  border: "1px solid rgba(216, 225, 255, 0.2)",
  borderRadius: "10px",
  backgroundColor: "rgba(9, 11, 22, 0.88)",
  lineHeight: "1.5",
});

document.body.append(canvas, status);

async function bootstrap(): Promise<void> {
  if (!("gpu" in navigator)) {
    status.textContent = "WebGPU is not available in this browser.";
    return;
  }

  status.textContent = "Initializing WebGPU...";

  try {
    const renderer = new Renderer(canvas);
    await renderer.initialize();

    function resize(): void {
      renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
    }

    function handleKeydown(event: KeyboardEvent): void {
      const step = 0.12;

      switch (event.key) {
        case "ArrowLeft":
          renderer.rotate(0, -step);
          event.preventDefault();
          break;
        case "ArrowRight":
          renderer.rotate(0, step);
          event.preventDefault();
          break;
        case "ArrowUp":
          renderer.rotate(-step, 0);
          event.preventDefault();
          break;
        case "ArrowDown":
          renderer.rotate(step, 0);
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
      isDragging = true;
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      canvas.style.cursor = "grabbing";
      canvas.setPointerCapture(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent): void {
      if (!isDragging) {
        return;
      }

      const deltaX = event.clientX - lastPointerX;
      const deltaY = event.clientY - lastPointerY;

      lastPointerX = event.clientX;
      lastPointerY = event.clientY;

      renderer.rotate(deltaY * 0.01, deltaX * 0.01);
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

    window.addEventListener("resize", resize);
    window.addEventListener("keydown", handleKeydown);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerEnd);
    canvas.addEventListener("pointercancel", handlePointerEnd);
    resize();

    status.remove();

    function frame(): void {
      renderer.render();
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    status.textContent = "WebGPU initialization failed. Check the console for details.";
  }
}

void bootstrap();
