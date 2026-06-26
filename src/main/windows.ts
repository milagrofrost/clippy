import { BrowserWindow, shell, screen, app } from "electron";
import contextMenu from "electron-context-menu";
import { getLogger } from "./logger";
import path from "path";
import { getStateManager } from "./state";
import { getDebugManager } from "./debug";
import { popupAppMenu } from "./menu";

let mainWindow: BrowserWindow | undefined;

export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow;
}

export async function createMainWindow() {
  getLogger().info("Creating main window");

  if (mainWindow && !mainWindow.isDestroyed()) {
    getLogger().info("Main window already exists, skipping creation");
    return;
  }

  const settings = getStateManager().store.get("settings");

  mainWindow = new BrowserWindow({
    width: 125,
    height: 100,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    frame: false,
    titleBarStyle: "hidden",
    acceptFirstMouse: true,
    backgroundMaterial: "none",
    paintWhenInitiallyHidden: true,
    resizable: false,
    maximizable: false,
    roundedCorners: false,
    thickFrame: false,
    title: "Clippy",
    alwaysOnTop: settings.clippyAlwaysOnTop,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on("system-context-menu", (event) => {
    event.preventDefault();
    popupAppMenu();
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
    popupAppMenu();
  });
}

export function setupWindowListener() {
  app.on(
    "browser-window-created",
    (_event: Electron.Event, browserWindow: BrowserWindow) => {
      const isMainWindow = !browserWindow.getParentWindow();

      getLogger().info(`Creating window (${isMainWindow ? "main" : "child"})`);

      setupWindowOpenHandler(browserWindow);
      setupNavigationHandler(browserWindow);

      if (!isMainWindow) {
        contextMenu({ window: browserWindow });
      }

      if (getDebugManager().store.get("openDevToolsOnStart")) {
        browserWindow.webContents.openDevTools({ mode: "detach" });
      }

      browserWindow.webContents.on("did-finish-load", () => {
        setFontSize(getStateManager().store.get("settings").defaultFontSize, [browserWindow]);
        setFont(getStateManager().store.get("settings").defaultFont, [browserWindow]);
      });
    },
  );
}

export function setupWindowOpenHandler(browserWindow: BrowserWindow) {
  browserWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
      return { action: "deny" };
    }

    const width = parseInt(features.match(/width=(\d+)/)?.[1] || "400", 10);
    const height = parseInt(features.match(/height=(\d+)/)?.[1] || "600", 10);
    const shouldPositionNextToParent = features.includes("positionNextToParent");
    const newWindowPosition = shouldPositionNextToParent
      ? getPopoverWindowPosition(browserWindow, { width, height })
      : undefined;

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        frame: false,
        x: newWindowPosition?.x,
        y: newWindowPosition?.y,
        roundedCorners: false,
        minHeight: 400,
        minWidth: 400,
        alwaysOnTop: getStateManager().store.get("settings").chatAlwaysOnTop,
        parent: browserWindow,
      },
    };
  });
}

function setupNavigationHandler(browserWindow: BrowserWindow) {
  browserWindow.webContents.on("will-navigate", (event, url) => {
    event.preventDefault();

    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
  });
}

export function getPopoverWindowPosition(
  browserWindow: BrowserWindow,
  size: { width: number; height: number },
): { x: number; y: number } {
  const parentBounds = browserWindow.getBounds();
  const { width, height } = size;
  const SPACING = 50;
  const displays = screen.getAllDisplays();
  const display =
    displays.find(
      (display) =>
        parentBounds.x >= display.bounds.x &&
        parentBounds.x <= display.bounds.x + display.bounds.width,
    ) || displays[0];

  const leftPosition = parentBounds.x - width - SPACING;
  const x = leftPosition < display.bounds.x
    ? parentBounds.x + parentBounds.width + SPACING
    : leftPosition;
  let y = parentBounds.y + parentBounds.height - height;

  if (y < display.bounds.y) {
    y = display.bounds.y;
  }

  return { x, y };
}

export function getChatWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(isChatWindow);
}

function isChatWindow(window: BrowserWindow): boolean {
  return window.webContents.getTitle() === "Clippy Chat";
}

export function toggleChatWindow() {
  const chatWindow = getChatWindow();

  if (!chatWindow) {
    return;
  }

  if (chatWindow.isVisible()) {
    chatWindow.hide();
  } else {
    const mainWindow = getMainWindow();
    const [width, height] = chatWindow.getSize();
    const position = getPopoverWindowPosition(mainWindow, { width, height });

    chatWindow.setPosition(position.x, position.y);
    chatWindow.show();
    chatWindow.focus();
  }
}

export function minimizeChatWindow() {
  return getChatWindow()?.minimize();
}

export function maximizeChatWindow() {
  if (getChatWindow()?.isMaximized()) {
    return getChatWindow()?.unmaximize();
  }

  return getChatWindow()?.maximize();
}
