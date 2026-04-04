import { attachControls } from "../input/controls";
import { Renderer } from "../renderer/renderer";

type ViewMode = "edit" | "render";

export async function bootstrap(): Promise<void> {
  const canvas = document.createElement("canvas");
  const renderImage = document.createElement("img");
  const status = document.createElement("p");
  const toolbar = createToolbar();
  let mode: ViewMode = "edit";
  let isRendering = false;

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

  renderImage.alt = "Rasterized scene preview";
  renderImage.draggable = false;

  Object.assign(renderImage.style, {
    position: "fixed",
    inset: "0",
    width: "100vw",
    height: "100vh",
    display: "none",
    objectFit: "cover",
    imageRendering: "auto",
    pointerEvents: "none",
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

  document.body.append(canvas, renderImage, toolbar.element, status);

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

      if (mode === "render") {
        updateRenderPreview();
      }
    }

    window.addEventListener("resize", resize);
    attachControls(canvas, renderer, () => mode === "edit");
    resize();

    status.remove();

    toolbar.setMode(mode, isRendering);
    toolbar.editButton.addEventListener("click", () => {
      if (mode === "edit" || isRendering) {
        return;
      }

      mode = "edit";
      syncModeUi();
    });
    toolbar.renderButton.addEventListener("click", async () => {
      if (mode === "render" || isRendering) {
        return;
      }

      mode = "render";
      await updateRenderPreview();
      syncModeUi();
    });
    const toolbarRotateStep = 0.18;
    toolbar.rotateUpButton.addEventListener("click", () => {
      if (mode !== "edit" || isRendering) {
        return;
      }

      renderer.rotate(-toolbarRotateStep, 0);
    });
    toolbar.rotateDownButton.addEventListener("click", () => {
      if (mode !== "edit" || isRendering) {
        return;
      }

      renderer.rotate(toolbarRotateStep, 0);
    });
    toolbar.rotateLeftButton.addEventListener("click", () => {
      if (mode !== "edit" || isRendering) {
        return;
      }

      renderer.rotate(0, -toolbarRotateStep);
    });
    toolbar.rotateRightButton.addEventListener("click", () => {
      if (mode !== "edit" || isRendering) {
        return;
      }

      renderer.rotate(0, toolbarRotateStep);
    });

    function syncModeUi(): void {
      const isEditMode = mode === "edit";
      canvas.style.display = isEditMode ? "block" : "none";
      renderImage.style.display = isEditMode ? "none" : "block";
      toolbar.setMode(mode, isRendering);
    }

    async function updateRenderPreview(): Promise<void> {
      isRendering = true;
      syncModeUi();
      await nextFrame();
      renderer.render();
      await nextFrame();
      renderImage.src = canvas.toDataURL("image/png");
      isRendering = false;
      syncModeUi();
    }

    function frame(): void {
      if (mode === "edit") {
        renderer.render();
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    status.textContent = "WebGPU initialization failed. Check the console for details.";
  }
}

function createToolbar(): {
  element: HTMLDivElement;
  editButton: HTMLButtonElement;
  renderButton: HTMLButtonElement;
  rotateUpButton: HTMLButtonElement;
  rotateDownButton: HTMLButtonElement;
  rotateLeftButton: HTMLButtonElement;
  rotateRightButton: HTMLButtonElement;
  setMode: (mode: ViewMode, isRendering: boolean) => void;
} {
  const toolbar = document.createElement("div");
  const handle = document.createElement("button");
  const editButton = document.createElement("button");
  const renderButton = document.createElement("button");
  const rotateCluster = document.createElement("div");
  const rotateUpButton = document.createElement("button");
  const rotateLeftButton = document.createElement("button");
  const rotateDownButton = document.createElement("button");
  const rotateRightButton = document.createElement("button");
  const loadingBorder = document.createElement("div");

  let pointerId: number | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  toolbar.setAttribute("aria-label", "Floating toolbar");

  Object.assign(toolbar.style, {
    position: "fixed",
    left: "32px",
    top: "32px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px",
    border: "1px solid rgba(197, 214, 255, 0.24)",
    borderRadius: "20px",
    background: "linear-gradient(180deg, rgba(217, 228, 255, 0.24), rgba(160, 186, 244, 0.14))",
    boxShadow: "0 18px 40px rgba(5, 8, 20, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    zIndex: "10",
    userSelect: "none",
    overflow: "hidden",
  });

  Object.assign(loadingBorder.style, {
    position: "absolute",
    inset: "0",
    display: "none",
    borderRadius: "inherit",
    padding: "2px",
    pointerEvents: "none",
    background:
      "conic-gradient(from 0deg, rgba(160, 196, 255, 0) 0deg, rgba(160, 196, 255, 0) 292deg, rgba(236, 244, 255, 0.96) 328deg, rgba(170, 202, 255, 0.72) 360deg)",
    WebkitMask:
      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    opacity: "0.95",
    animation: "liquidware-toolbar-snake 1s linear infinite",
  });

  configureButton(handle, "≡", "idle");
  handle.setAttribute("aria-label", "Drag toolbar");
  handle.title = "Drag toolbar";
  handle.style.cursor = "grab";
  handle.style.width = "30px";
  handle.style.minWidth = "30px";
  handle.style.padding = "0";
  handle.style.fontSize = "19px";
  handle.style.letterSpacing = "1px";

  configureButton(editButton, "edit", "active");
  configureButton(renderButton, "render", "idle");
  configureRotateButton(rotateUpButton, "↑", "Tilt scene up");
  configureRotateButton(rotateLeftButton, "←", "Spin scene left");
  configureRotateButton(rotateDownButton, "↓", "Tilt scene down");
  configureRotateButton(rotateRightButton, "→", "Spin scene right");

  Object.assign(rotateCluster.style, {
    display: "grid",
    gridTemplateColumns: "repeat(3, 34px)",
    gridTemplateRows: "repeat(2, 34px)",
    gap: "6px",
    alignItems: "center",
  });

  rotateUpButton.style.gridColumn = "2";
  rotateUpButton.style.gridRow = "1";
  rotateLeftButton.style.gridColumn = "1";
  rotateLeftButton.style.gridRow = "2";
  rotateDownButton.style.gridColumn = "2";
  rotateDownButton.style.gridRow = "2";
  rotateRightButton.style.gridColumn = "3";
  rotateRightButton.style.gridRow = "2";

  rotateCluster.append(rotateUpButton, rotateLeftButton, rotateDownButton, rotateRightButton);

  handle.addEventListener("pointerdown", (event) => {
    pointerId = event.pointerId;
    dragOffsetX = event.clientX - toolbar.offsetLeft;
    dragOffsetY = event.clientY - toolbar.offsetTop;
    handle.style.cursor = "grabbing";
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener("pointermove", (event) => {
    if (pointerId !== event.pointerId) {
      return;
    }

    const maxLeft = Math.max(0, window.innerWidth - toolbar.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - toolbar.offsetHeight);
    const nextLeft = clamp(event.clientX - dragOffsetX, 0, maxLeft);
    const nextTop = clamp(event.clientY - dragOffsetY, 0, maxTop);

    toolbar.style.left = `${nextLeft}px`;
    toolbar.style.top = `${nextTop}px`;
  });

  const endDrag = (event: PointerEvent) => {
    if (pointerId !== event.pointerId) {
      return;
    }

    pointerId = null;
    handle.style.cursor = "grab";

    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
  };

  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  toolbar.append(loadingBorder, handle, editButton, renderButton, rotateCluster);

  return {
    element: toolbar,
    editButton,
    renderButton,
    rotateUpButton,
    rotateDownButton,
    rotateLeftButton,
    rotateRightButton,
    setMode: (mode, isRendering) => {
      const disableRotation = isRendering || mode !== "edit";

      setButtonState(editButton, mode === "edit" ? "active" : "idle");
      setButtonState(renderButton, mode === "render" ? "active" : "idle");
      loadingBorder.style.display = isRendering ? "block" : "none";
      editButton.disabled = isRendering;
      renderButton.disabled = isRendering;
      editButton.style.cursor = isRendering ? "wait" : "pointer";
      renderButton.style.cursor = isRendering ? "wait" : "pointer";

      for (const button of [rotateUpButton, rotateDownButton, rotateLeftButton, rotateRightButton]) {
        button.disabled = disableRotation;
        button.style.cursor = disableRotation ? (isRendering ? "wait" : "default") : "pointer";
        button.style.opacity = disableRotation ? "0.42" : "0.92";
      }
    },
  };
}

type ToolbarButtonState = "active" | "idle";

function configureButton(
  button: HTMLButtonElement,
  label: string,
  initialState: ToolbarButtonState,
): void {
  button.type = "button";
  button.textContent = label;

  Object.assign(button.style, {
    appearance: "none",
    border: "1px solid rgba(162, 184, 231, 0.34)",
    borderRadius: "12px",
    color: "rgba(232, 240, 255, 0.95)",
    minWidth: "74px",
    height: "42px",
    padding: "0 18px",
    fontFamily: "\"IBM Plex Sans\", \"Avenir Next\", sans-serif",
    fontSize: "14px",
    fontWeight: "600",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.16)",
    cursor: "pointer",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease",
  });

  setButtonState(button, initialState);
}

function configureRotateButton(button: HTMLButtonElement, label: string, title: string): void {
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", title);
  button.title = title;

  Object.assign(button.style, {
    appearance: "none",
    width: "34px",
    height: "34px",
    padding: "0",
    border: "1px solid rgba(180, 198, 238, 0.3)",
    borderRadius: "10px",
    background: "linear-gradient(180deg, rgba(218, 231, 255, 0.22), rgba(170, 193, 243, 0.1))",
    color: "rgba(238, 244, 255, 0.95)",
    fontFamily: "\"IBM Plex Sans\", \"Avenir Next\", sans-serif",
    fontSize: "18px",
    fontWeight: "700",
    lineHeight: "1",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.12)",
    cursor: "pointer",
    opacity: "0.92",
    transition: "background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease",
  });
}

function setButtonState(button: HTMLButtonElement, state: ToolbarButtonState): void {
  if (state === "active") {
    button.style.background =
      "linear-gradient(180deg, rgba(233, 241, 255, 0.45), rgba(181, 203, 249, 0.3))";
    button.style.borderColor = "rgba(203, 220, 255, 0.48)";
    button.style.boxShadow =
      "0 10px 24px rgba(7, 12, 28, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.24)";
    button.style.opacity = "1";
    return;
  }

  button.style.background =
    "linear-gradient(180deg, rgba(215, 228, 255, 0.2), rgba(171, 194, 243, 0.12))";
  button.style.borderColor = "rgba(162, 184, 231, 0.26)";
  button.style.boxShadow = "inset 0 1px 0 rgba(255, 255, 255, 0.12)";
  button.style.opacity = "0.78";
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const toolbarAnimationStyles = document.createElement("style");
toolbarAnimationStyles.textContent = `
  @keyframes liquidware-toolbar-snake {
    from {
      transform: rotate(0deg);
    }

    to {
      transform: rotate(360deg);
    }
  }
`;

if (!document.head.querySelector('style[data-liquidware-toolbar-animations="true"]')) {
  toolbarAnimationStyles.dataset.liquidwareToolbarAnimations = "true";
  document.head.append(toolbarAnimationStyles);
}
