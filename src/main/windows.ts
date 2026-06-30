import { BrowserWindow, shell, screen, app } from "electron";
import contextMenu from "electron-context-menu";
import { getLogger } from "./logger";

import path from "path";
import { getStateManager } from "./state";
import { getDebugManager } from "./debug";
import { popupAppMenu } from "./menu";

let mainWindow: BrowserWindow | undefined;

/**
 * Get the main window
 *
 * @returns The main window
 */
export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow;
}

/**
 * Create the main window
 *
 * @returns The main window
 */
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
      const isMainWindow = browserWindow === mainWindow;

      getLogger().info(`Creating window (${isMainWindow ? "main" : "chat/child"})`);

      setupWindowOpenHandler(browserWindow);
      setupNavigationHandler(browserWindow);

      if (!isMainWindow) {
        contextMenu({
          window: browserWindow,
        });
        scheduleChatWindowPlacement(browserWindow);
      }

      if (getDebugManager().store.get("openDevToolsOnStart")) {
        browserWindow.webContents.openDevTools({ mode: "detach" });
      }

      browserWindow.webContents.on("did-finish-load", () => {
        setFontSize(getStateManager().store.get("settings").defaultFontSize, [
          browserWindow,
        ]);
        setFont(getStateManager().store.get("settings").defaultFont, [
          browserWindow,
        ]);
        scheduleChatWindowPlacement(browserWindow);
      });
    },
  );
}

/**
 * Setup the window open handler
 *
 * @param browserWindow The browser window
 */
export function setupWindowOpenHandler(browserWindow: BrowserWindow) {
  browserWindow.webContents.setWindowOpenHandler(({ url, features }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);

      return { action: "deny" };
    }

    getLogger().info(`window.open() called with features: ${features}`);

    const width = parseInt(features.match(/width=(\d+)/)?.[1] || "400", 10);
    const height = parseInt(features.match(/height=(\d+)/)?.[1] || "600", 10);
    const settings = getStateManager().store.get("settings");
    const shouldPositionNextToParent = features.includes(
      "positionNextToParent",
    );
    const newWindowPosition = shouldPositionNextToParent
      ? getChatWindowPosition(browserWindow, { width, height })
      : undefined;

    getLogger().info(
      `Initial chat window position request: ${newWindowPosition?.x},${newWindowPosition?.y} size ${width}x${height}`,
    );

    return {
      action: "allow",
      overrideBrowserWindowOptions: {
        frame: false,
        width,
        height,
        x: newWindowPosition?.x,
        y: newWindowPosition?.y,
        roundedCorners: false,
        minHeight: Math.min(300, height),
        minWidth: Math.min(300, width),
        alwaysOnTop: settings.chatAlwaysOnTop,
        parent: settings.centerChatWindow ? undefined : browserWindow,
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

function getDisplayForWindow(browserWindow: BrowserWindow) {
  const parentBounds = browserWindow.getBounds();
  const displays = screen.getAllDisplays();

  return (
    displays.find(
      (display) =>
        parentBounds.x >= display.bounds.x &&
        parentBounds.x <= display.bounds.x + display.bounds.width,
    ) || screen.getPrimaryDisplay()
  );
}

function getChatWindowPosition(
  browserWindow: BrowserWindow,
  size: { width: number; height: number },
): { x: number; y: number } {
  const settings = getStateManager().store.get("settings");

  return settings.centerChatWindow
    ? getCenteredWindowPosition(size)
    : getPopoverWindowPosition(browserWindow, size);
}

/**
 * Get the new window position centered on the primary display
 *
 * @param size The size of the new window
 * @returns The centered window position
 */
export function getCenteredWindowPosition(size: {
  width: number;
  height: number;
}): { x: number; y: number } {
  const { width, height } = size;
  const area = screen.getPrimaryDisplay().workArea;

  const x = Math.round(area.x + (area.width - width) / 2);
  const y = Math.round(area.y + (area.height - height) / 2);

  return {
    x: clamp(x, area.x, area.x + area.width - width),
    y: clamp(y, area.y, area.y + area.height - height),
  };
}

/**
 * Get the new window position for a popover-like window
 *
 * @param browserWindow The browser window
 * @param size The size of the new window
 * @returns The new window position
 */
export function getPopoverWindowPosition(
  browserWindow: BrowserWindow,
  size: { width: number; height: number },
): { x: number; y: number } {
  const parentBounds = browserWindow.getBounds();
  const { width, height } = size;
  const SPACING = 50; // Distance between windows

  // Get the current display
  const display = getDisplayForWindow(browserWindow);

  // Calculate horizontal position (left or right of parent)
  let x: number;
  const leftPosition = parentBounds.x - width - SPACING;

  // If left position would be off-screen, position to the right
  if (leftPosition < display.bounds.x) {
    x = parentBounds.x + parentBounds.width + SPACING;
  } else {
    x = leftPosition;
  }

  // Try to align the bottom of the new window with the parent window
  let y = parentBounds.y + parentBounds.height - height;

  // Check if the window would be too high (off-screen at the top)
  if (y < display.bounds.y) {
    // Move the window down as much as necessary
    y = display.bounds.y;
  }

  return { x, y };
}

function scheduleChatWindowPlacement(browserWindow: BrowserWindow) {
  const delays = [0, 50, 150, 300, 600];

  for (const delay of delays) {
    setTimeout(() => forceChatWindowPlacement(browserWindow, delay), delay);
  }
}

function forceChatWindowPlacement(browserWindow: BrowserWindow, delay = 0) {
  if (browserWindow.isDestroyed()) {
    return;
  }

  if (!isChatWindow(browserWindow)) {
    getLogger().info(
      `Skipping placement after ${delay}ms for non-chat window titled "${browserWindow.webContents.getTitle()}"`,
    );
    return;
  }

  const settings = getStateManager().store.get("settings");

  if (!settings.centerChatWindow) {
    return;
  }

  const width = settings.chatWindowWidth || browserWindow.getSize()[0];
  const height = settings.chatWindowHeight || browserWindow.getSize()[1];
  const position = getCenteredWindowPosition({ width, height });

  browserWindow.setSize(width, height);
  browserWindow.setPosition(position.x, position.y);
  getLogger().info(
    `Centered chat window after ${delay}ms at ${position.x},${position.y} with size ${width}x${height}; actual bounds ${JSON.stringify(browserWindow.getBounds())}`,
  );
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

/**
 * Get the chat window
 *
 * @returns The chat window
 */
export function getChatWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(isChatWindow);
}

/**
 * Check if a window is a chat window
 *
 * @param window The window to check
 * @returns True if a window is a chat window
 */
function isChatWindow(window: BrowserWindow): boolean {
  return window.webContents.getTitle() === "Clippy Chat";
}

/**
 * Toggle the chat window
 */
export function toggleChatWindow() {
  const chatWindow = getChatWindow();

  if (!chatWindow) {
    return;
  }

  if (chatWindow.isVisible()) {
    chatWindow.hide();
  } else {
    const mainWindow = getMainWindow();

    if (!mainWindow) {
      chatWindow.show();
      chatWindow.focus();
      return;
    }

    const [width, height] = chatWindow.getSize();
    const position = getChatWindowPosition(mainWindow, { width, height });

    chatWindow.setPosition(position.x, position.y);
    chatWindow.show();
    chatWindow.focus();
  }
}

/**
 * Minimize the chat window
 */
export function minimizeChatWindow() {
  return getChatWindow()?.minimize();
}

/**
 * Maximize the chat window
 */
export function maximizeChatWindow() {
  if (getChatWindow()?.isMaximized()) {
    return getChatWindow()?.unmaximize();
  }

  return getChatWindow()?.maximize();
}

/**
 * Set the font size for all windows
 *
 * @param fontSize The font size to set
 */
export function setFontSize(
  fontSize: number,
  windows: BrowserWindow[] = BrowserWindow.getAllWindows(),
) {
  windows.forEach((window) => {
    window.webContents.executeJavaScript(
      `document.documentElement.style.setProperty('--font-size', '${fontSize}px');`,
    );
  });
}

/**
 * Set the font for all windows
 *
 * @param font The font to set
 */
export function setFont(
  font: string,
  windows: BrowserWindow[] = BrowserWindow.getAllWindows(),
) {
  windows.forEach((window) => {
    window.webContents.executeJavaScript(
      `document.querySelector('.clippy').setAttribute('data-font', '${font}');`,
    );
  });
}
