import { attachControls } from "../input/controls";
import { Renderer } from "../renderer/renderer";

export async function bootstrap(): Promise<void> {
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

    window.addEventListener("resize", resize);
    attachControls(canvas, renderer);
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
