import { attachControls } from "../input/controls";
import { parseObjMesh } from "../renderer/mesh";
import { applyRetroGrade } from "../renderer/postprocess";
import { Renderer } from "../renderer/renderer";

type ViewMode = "edit" | "render";
type MaterialControlElements = {
  colorInput: HTMLInputElement;
  surfaceInput: HTMLInputElement;
  surfaceValue: HTMLSpanElement;
  glossInput: HTMLInputElement;
  glossValue: HTMLSpanElement;
  bleedInput: HTMLInputElement;
  bleedValue: HTMLSpanElement;
  panel: HTMLDivElement;
};
type TransformControlElements = {
  scaleInput: HTMLInputElement;
  scaleValue: HTMLSpanElement;
  offsetXInput: HTMLInputElement;
  offsetXValue: HTMLSpanElement;
  offsetYInput: HTMLInputElement;
  offsetYValue: HTMLSpanElement;
  offsetZInput: HTMLInputElement;
  offsetZValue: HTMLSpanElement;
  panel: HTMLDivElement;
};
type MeshControlElements = {
  uploadButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  fileInput: HTMLInputElement;
  name: HTMLSpanElement;
  panel: HTMLDivElement;
};

export async function bootstrap(): Promise<void> {
  const canvas = document.createElement("canvas");
  const renderStage = document.createElement("div");
  const renderImage = document.createElement("img");
  const status = document.createElement("p");
  const toolbar = createToolbar();
  let mode: ViewMode = "edit";
  let isRendering = false;
  let renderBlob: Blob | null = null;
  let renderUrl: string | null = null;

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

  Object.assign(renderStage.style, {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px",
    backgroundColor: "#000000",
  });

  renderImage.alt = "Rasterized scene preview";
  renderImage.draggable = false;

  Object.assign(renderImage.style, {
    display: "block",
    maxWidth: "min(100%, 960px)",
    maxHeight: "calc(100vh - 80px)",
    width: "auto",
    height: "auto",
    objectFit: "contain",
    imageRendering: "auto",
    boxShadow: "0 18px 40px rgba(0, 0, 0, 0.5)",
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

  renderStage.append(renderImage);
  document.body.append(canvas, renderStage, toolbar.element, status);

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
    renderer.setMaterial({
      color: hexToRgb(toolbar.material.colorInput.value),
      surface: Number(toolbar.material.surfaceInput.value),
      gloss: Number(toolbar.material.glossInput.value),
      bleed: Number(toolbar.material.bleedInput.value),
    });

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
    toolbar.downloadButton.addEventListener("click", () => {
      if (mode !== "render" || isRendering || !renderBlob) {
        return;
      }

      const downloadUrl = URL.createObjectURL(renderBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `liquidware-render-${Date.now()}.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
    });
    toolbar.copyButton.addEventListener("click", async () => {
      if (mode !== "render" || isRendering || !renderBlob) {
        return;
      }

      if (!("clipboard" in navigator) || typeof ClipboardItem === "undefined") {
        flashButtonLabel(toolbar.copyButton, "unavailable");
        return;
      }

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [renderBlob.type]: renderBlob,
          }),
        ]);
        flashButtonLabel(toolbar.copyButton, "copied");
      } catch (error) {
        console.error(error);
        flashButtonLabel(toolbar.copyButton, "failed");
      }
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
    toolbar.material.colorInput.addEventListener("input", () => {
      renderer.setMaterial({
        color: hexToRgb(toolbar.material.colorInput.value),
      });
    });
    toolbar.material.surfaceInput.addEventListener("input", () => {
      const surface = Number(toolbar.material.surfaceInput.value);
      toolbar.material.surfaceValue.textContent = surface.toFixed(2);
      renderer.setMaterial({ surface });
    });
    toolbar.material.glossInput.addEventListener("input", () => {
      const gloss = Number(toolbar.material.glossInput.value);
      toolbar.material.glossValue.textContent = gloss.toFixed(2);
      renderer.setMaterial({ gloss });
    });
    toolbar.material.bleedInput.addEventListener("input", () => {
      const bleed = Number(toolbar.material.bleedInput.value);
      toolbar.material.bleedValue.textContent = bleed.toFixed(2);
      renderer.setMaterial({ bleed });
    });
    toolbar.transform.scaleInput.addEventListener("input", () => {
      const scale = Number(toolbar.transform.scaleInput.value);
      toolbar.transform.scaleValue.textContent = scale.toFixed(2);
      renderer.setObjectTransform({ scale });
    });
    toolbar.transform.offsetXInput.addEventListener("input", () => {
      const offsetX = Number(toolbar.transform.offsetXInput.value);
      toolbar.transform.offsetXValue.textContent = offsetX.toFixed(2);
      renderer.setObjectTransform({ offsetX });
    });
    toolbar.transform.offsetYInput.addEventListener("input", () => {
      const offsetY = Number(toolbar.transform.offsetYInput.value);
      toolbar.transform.offsetYValue.textContent = offsetY.toFixed(2);
      renderer.setObjectTransform({ offsetY });
    });
    toolbar.transform.offsetZInput.addEventListener("input", () => {
      const offsetZ = Number(toolbar.transform.offsetZInput.value);
      toolbar.transform.offsetZValue.textContent = offsetZ.toFixed(2);
      renderer.setObjectTransform({ offsetZ });
    });
    toolbar.mesh.uploadButton.addEventListener("click", () => {
      if (isRendering) {
        return;
      }

      toolbar.mesh.fileInput.click();
    });
    toolbar.mesh.resetButton.addEventListener("click", async () => {
      if (isRendering) {
        return;
      }

      renderer.resetObjectMesh();
      toolbar.mesh.fileInput.value = "";
      toolbar.mesh.name.textContent = "cube";
      flashButtonLabel(toolbar.mesh.resetButton, "cube");

      if (mode === "render") {
        await updateRenderPreview();
      }
    });
    toolbar.mesh.fileInput.addEventListener("change", async () => {
      const file = toolbar.mesh.fileInput.files?.[0];

      if (!file || isRendering) {
        return;
      }

      try {
        const mesh = parseObjMesh(await file.text());
        renderer.setObjectMesh(mesh);
        toolbar.mesh.name.textContent = clampLabel(file.name, 22);
        flashButtonLabel(toolbar.mesh.uploadButton, "loaded");

        if (mode === "render") {
          await updateRenderPreview();
        }
      } catch (error) {
        console.error(error);
        toolbar.mesh.fileInput.value = "";
        flashButtonLabel(toolbar.mesh.uploadButton, "invalid");
      }
    });

    function syncModeUi(): void {
      const isEditMode = mode === "edit";
      canvas.style.display = isEditMode ? "block" : "none";
      renderStage.style.display = isEditMode ? "none" : "flex";
      toolbar.setMode(mode, isRendering);
    }

    async function updateRenderPreview(): Promise<void> {
      isRendering = true;
      syncModeUi();
      await nextFrame();
      renderer.render();
      await nextFrame();
      const nextRenderBlob = await renderRetroPreviewBlob(canvas);
      if (!nextRenderBlob) {
        throw new Error("Unable to rasterize render preview.");
      }

      if (renderUrl) {
        URL.revokeObjectURL(renderUrl);
      }

      renderBlob = nextRenderBlob;
      renderUrl = URL.createObjectURL(nextRenderBlob);
      renderImage.src = renderUrl;
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
  downloadButton: HTMLButtonElement;
  copyButton: HTMLButtonElement;
  rotateUpButton: HTMLButtonElement;
  rotateDownButton: HTMLButtonElement;
  rotateLeftButton: HTMLButtonElement;
  rotateRightButton: HTMLButtonElement;
  transform: TransformControlElements;
  material: MaterialControlElements;
  mesh: MeshControlElements;
  setMode: (mode: ViewMode, isRendering: boolean) => void;
} {
  const toolbar = document.createElement("div");
  const handle = document.createElement("button");
  const editButton = document.createElement("button");
  const renderButton = document.createElement("button");
  const actionCluster = document.createElement("div");
  const downloadButton = document.createElement("button");
  const copyButton = document.createElement("button");
  const rotateCluster = document.createElement("div");
  const rotateUpButton = document.createElement("button");
  const rotateLeftButton = document.createElement("button");
  const rotateDownButton = document.createElement("button");
  const rotateRightButton = document.createElement("button");
  const transformPanel = document.createElement("div");
  const scaleLabel = document.createElement("label");
  const scaleInput = document.createElement("input");
  const scaleValue = document.createElement("span");
  const offsetXLabel = document.createElement("label");
  const offsetXInput = document.createElement("input");
  const offsetXValue = document.createElement("span");
  const offsetYLabel = document.createElement("label");
  const offsetYInput = document.createElement("input");
  const offsetYValue = document.createElement("span");
  const offsetZLabel = document.createElement("label");
  const offsetZInput = document.createElement("input");
  const offsetZValue = document.createElement("span");
  const meshPanel = document.createElement("div");
  const meshLabel = document.createElement("label");
  const meshControls = document.createElement("div");
  const uploadMeshButton = document.createElement("button");
  const resetMeshButton = document.createElement("button");
  const meshName = document.createElement("span");
  const meshFileInput = document.createElement("input");
  const materialPanel = document.createElement("div");
  const colorLabel = document.createElement("label");
  const colorInput = document.createElement("input");
  const surfaceLabel = document.createElement("label");
  const surfaceInput = document.createElement("input");
  const surfaceValue = document.createElement("span");
  const glossLabel = document.createElement("label");
  const glossInput = document.createElement("input");
  const glossValue = document.createElement("span");
  const bleedLabel = document.createElement("label");
  const bleedInput = document.createElement("input");
  const bleedValue = document.createElement("span");
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
  configureButton(downloadButton, "download", "idle");
  configureButton(copyButton, "copy", "idle");
  configureRotateButton(rotateUpButton, "↑", "Tilt scene up");
  configureRotateButton(rotateLeftButton, "←", "Spin scene left");
  configureRotateButton(rotateDownButton, "↓", "Tilt scene down");
  configureRotateButton(rotateRightButton, "→", "Spin scene right");

  Object.assign(actionCluster.style, {
    display: "none",
    alignItems: "center",
    gap: "10px",
  });

  Object.assign(rotateCluster.style, {
    display: "grid",
    gridTemplateColumns: "repeat(3, 34px)",
    gridTemplateRows: "repeat(2, 34px)",
    gap: "6px",
    alignItems: "center",
  });

  Object.assign(meshPanel.style, {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "8px",
    padding: "10px 12px",
    border: "1px solid rgba(187, 204, 240, 0.18)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(14, 19, 39, 0.42), rgba(10, 14, 28, 0.26))",
    minWidth: "198px",
  });

  Object.assign(transformPanel.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, auto))",
    gap: "8px 12px",
    padding: "10px 12px",
    border: "1px solid rgba(187, 204, 240, 0.18)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(14, 19, 39, 0.42), rgba(10, 14, 28, 0.26))",
    alignItems: "center",
    minWidth: "212px",
  });

  rotateUpButton.style.gridColumn = "2";
  rotateUpButton.style.gridRow = "1";
  rotateLeftButton.style.gridColumn = "1";
  rotateLeftButton.style.gridRow = "2";
  rotateDownButton.style.gridColumn = "2";
  rotateDownButton.style.gridRow = "2";
  rotateRightButton.style.gridColumn = "3";
  rotateRightButton.style.gridRow = "2";

  Object.assign(materialPanel.style, {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, auto))",
    gap: "8px 12px",
    padding: "10px 12px",
    border: "1px solid rgba(187, 204, 240, 0.18)",
    borderRadius: "14px",
    background: "linear-gradient(180deg, rgba(14, 19, 39, 0.42), rgba(10, 14, 28, 0.26))",
    alignItems: "center",
    minWidth: "212px",
  });

  configureMaterialLabel(scaleLabel, "scale");
  configureMaterialLabel(offsetXLabel, "move x");
  configureMaterialLabel(offsetYLabel, "move y");
  configureMaterialLabel(offsetZLabel, "move z");
  configureMaterialLabel(meshLabel, "mesh");
  configureMaterialLabel(colorLabel, "color");
  configureMaterialLabel(surfaceLabel, "surface");
  configureMaterialLabel(glossLabel, "gloss");
  configureMaterialLabel(bleedLabel, "bleed");

  configureButton(uploadMeshButton, "load .obj", "idle");
  configureButton(resetMeshButton, "cube", "idle");
  uploadMeshButton.style.minWidth = "0";
  uploadMeshButton.style.padding = "0 14px";
  resetMeshButton.style.minWidth = "0";
  resetMeshButton.style.padding = "0 14px";

  Object.assign(meshControls.style, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    alignItems: "center",
  });

  meshFileInput.type = "file";
  meshFileInput.accept = ".obj,model/obj,text/plain";
  meshFileInput.hidden = true;

  meshName.textContent = "cube";
  Object.assign(meshName.style, {
    minHeight: "18px",
    color: "rgba(230, 238, 255, 0.82)",
    fontFamily: "monospace",
    fontSize: "12px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });

  configureMaterialRange(scaleInput, "Object scale");
  scaleInput.min = "0.25";
  scaleInput.max = "2.5";
  scaleInput.step = "0.01";
  scaleInput.value = "1.00";
  configureMaterialRange(offsetXInput, "Object x offset");
  offsetXInput.min = "-1.5";
  offsetXInput.max = "1.5";
  offsetXInput.step = "0.01";
  offsetXInput.value = "0.00";
  configureMaterialRange(offsetYInput, "Object y offset");
  offsetYInput.min = "-1.5";
  offsetYInput.max = "1.5";
  offsetYInput.step = "0.01";
  offsetYInput.value = "0.00";
  configureMaterialRange(offsetZInput, "Object z offset");
  offsetZInput.min = "-1.5";
  offsetZInput.max = "1.5";
  offsetZInput.step = "0.01";
  offsetZInput.value = "0.00";

  configureMaterialValue(scaleValue, scaleInput.value);
  configureMaterialValue(offsetXValue, offsetXInput.value);
  configureMaterialValue(offsetYValue, offsetYInput.value);
  configureMaterialValue(offsetZValue, offsetZInput.value);

  colorInput.type = "color";
  colorInput.value = "#38c2dc";
  colorInput.setAttribute("aria-label", "Object material color");
  Object.assign(colorInput.style, {
    width: "40px",
    height: "28px",
    padding: "0",
    border: "1px solid rgba(196, 214, 255, 0.28)",
    borderRadius: "8px",
    background: "transparent",
    cursor: "pointer",
  });

  configureMaterialRange(surfaceInput, "Object material surface");
  surfaceInput.value = "0.38";
  configureMaterialRange(glossInput, "Object material gloss");
  glossInput.value = "0.62";
  configureMaterialRange(bleedInput, "Object material light bleed");
  bleedInput.value = "0.22";

  configureMaterialValue(surfaceValue, surfaceInput.value);
  configureMaterialValue(glossValue, glossInput.value);
  configureMaterialValue(bleedValue, bleedInput.value);

  actionCluster.append(downloadButton, copyButton);
  rotateCluster.append(rotateUpButton, rotateLeftButton, rotateDownButton, rotateRightButton);
  transformPanel.append(
    scaleLabel,
    wrapMaterialRange(scaleInput, scaleValue),
    offsetXLabel,
    wrapMaterialRange(offsetXInput, offsetXValue),
    offsetYLabel,
    wrapMaterialRange(offsetYInput, offsetYValue),
    offsetZLabel,
    wrapMaterialRange(offsetZInput, offsetZValue),
  );
  meshControls.append(uploadMeshButton, resetMeshButton);
  meshPanel.append(meshLabel, meshControls, meshName, meshFileInput);
  materialPanel.append(
    colorLabel,
    colorInput,
    surfaceLabel,
    wrapMaterialRange(surfaceInput, surfaceValue),
    glossLabel,
    wrapMaterialRange(glossInput, glossValue),
    bleedLabel,
    wrapMaterialRange(bleedInput, bleedValue),
  );

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

  toolbar.append(
    loadingBorder,
    handle,
    editButton,
    renderButton,
    actionCluster,
    rotateCluster,
    transformPanel,
    meshPanel,
    materialPanel,
  );

  return {
    element: toolbar,
    editButton,
    renderButton,
    downloadButton,
    copyButton,
    rotateUpButton,
    rotateDownButton,
    rotateLeftButton,
    rotateRightButton,
    transform: {
      scaleInput,
      scaleValue,
      offsetXInput,
      offsetXValue,
      offsetYInput,
      offsetYValue,
      offsetZInput,
      offsetZValue,
      panel: transformPanel,
    },
    mesh: {
      uploadButton: uploadMeshButton,
      resetButton: resetMeshButton,
      fileInput: meshFileInput,
      name: meshName,
      panel: meshPanel,
    },
    material: {
      colorInput,
      surfaceInput,
      surfaceValue,
      glossInput,
      glossValue,
      bleedInput,
      bleedValue,
      panel: materialPanel,
    },
    setMode: (mode, isRendering) => {
      const disableRotation = isRendering || mode !== "edit";
      const disableRenderActions = isRendering || mode !== "render";
      const disableTransform = isRendering;
      const disableMaterial = isRendering;
      const disableMesh = isRendering;
      const showEditControls = mode === "edit";

      setButtonState(editButton, mode === "edit" ? "active" : "idle");
      setButtonState(renderButton, mode === "render" ? "active" : "idle");
      loadingBorder.style.display = isRendering ? "block" : "none";
      editButton.disabled = isRendering;
      renderButton.disabled = isRendering;
      editButton.style.cursor = isRendering ? "wait" : "pointer";
      renderButton.style.cursor = isRendering ? "wait" : "pointer";
      actionCluster.style.display = mode === "render" ? "flex" : "none";
      rotateCluster.style.display = showEditControls ? "grid" : "none";
      transformPanel.style.display = showEditControls ? "grid" : "none";
      meshPanel.style.display = showEditControls ? "grid" : "none";
      materialPanel.style.display = showEditControls ? "grid" : "none";

      for (const button of [downloadButton, copyButton]) {
        button.disabled = disableRenderActions;
        button.style.cursor = disableRenderActions ? (isRendering ? "wait" : "default") : "pointer";
        button.style.opacity = disableRenderActions ? "0.42" : "0.92";
      }

      for (const button of [rotateUpButton, rotateDownButton, rotateLeftButton, rotateRightButton]) {
        button.disabled = disableRotation;
        button.style.cursor = disableRotation ? (isRendering ? "wait" : "default") : "pointer";
        button.style.opacity = disableRotation ? "0.42" : "0.92";
      }

      for (const button of [uploadMeshButton, resetMeshButton]) {
        button.disabled = disableMesh;
        button.style.cursor = disableMesh ? (isRendering ? "wait" : "default") : "pointer";
        button.style.opacity = disableMesh ? "0.42" : "0.92";
      }

      for (const input of [scaleInput, offsetXInput, offsetYInput, offsetZInput]) {
        input.disabled = disableTransform;
        input.style.cursor = disableTransform ? (isRendering ? "wait" : "default") : "pointer";
        input.style.opacity = disableTransform ? "0.42" : "0.96";
      }

      for (const input of [colorInput, surfaceInput, glossInput, bleedInput]) {
        input.disabled = disableMaterial;
        input.style.cursor = disableMaterial ? (isRendering ? "wait" : "default") : "pointer";
        input.style.opacity = disableMaterial ? "0.42" : "0.96";
      }

      transformPanel.style.opacity = disableTransform ? "0.56" : "1";
      materialPanel.style.opacity = disableMaterial ? "0.56" : "1";
      meshPanel.style.opacity = disableMesh ? "0.56" : "1";
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

function configureMaterialLabel(label: HTMLLabelElement, text: string): void {
  label.textContent = text;

  Object.assign(label.style, {
    color: "rgba(222, 233, 255, 0.9)",
    fontFamily: "\"IBM Plex Sans\", \"Avenir Next\", sans-serif",
    fontSize: "12px",
    fontWeight: "600",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  });
}

function configureMaterialRange(input: HTMLInputElement, label: string): void {
  input.type = "range";
  input.min = "0";
  input.max = "1";
  input.step = "0.01";
  input.setAttribute("aria-label", label);

  Object.assign(input.style, {
    width: "100%",
    margin: "0",
    accentColor: "#d4e7ff",
  });
}

function configureMaterialValue(value: HTMLSpanElement, text: string): void {
  value.textContent = Number(text).toFixed(2);

  Object.assign(value.style, {
    minWidth: "32px",
    color: "rgba(230, 238, 255, 0.82)",
    fontFamily: "monospace",
    fontSize: "12px",
    textAlign: "right",
  });
}

function wrapMaterialRange(input: HTMLInputElement, value: HTMLSpanElement): HTMLDivElement {
  const wrapper = document.createElement("div");

  Object.assign(wrapper.style, {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: "8px",
    alignItems: "center",
  });

  wrapper.append(input, value);
  return wrapper;
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

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

async function renderRetroPreviewBlob(sourceCanvas: HTMLCanvasElement): Promise<Blob | null> {
  const processingCanvas = document.createElement("canvas");
  processingCanvas.width = sourceCanvas.width;
  processingCanvas.height = sourceCanvas.height;

  const context = processingCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return canvasToBlob(sourceCanvas);
  }

  context.drawImage(sourceCanvas, 0, 0);

  const imageData = context.getImageData(0, 0, processingCanvas.width, processingCanvas.height);
  const gradedPixels = applyRetroGrade(imageData.data, imageData.width, imageData.height);
  imageData.data.set(gradedPixels);
  context.putImageData(imageData, 0, 0);

  return canvasToBlob(processingCanvas);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function flashButtonLabel(button: HTMLButtonElement, label: string): void {
  const originalLabel = button.dataset.originalLabel ?? button.textContent ?? "";
  button.dataset.originalLabel = originalLabel;
  button.textContent = label;
  window.setTimeout(() => {
    button.textContent = originalLabel;
  }, 1200);
}

function clampLabel(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
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
