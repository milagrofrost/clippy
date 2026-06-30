# Clippy

[Clippy](https://felixrieseberg.github.io/clippy/) lets you run a variety of large language models (LLMs) locally on your computer while sticking with a user interface of the 1990s. Through Llama.cpp, it supports models in the popular GGUF format, which is to say most publicly available models. It comes with one-click installation support for Google's Gemma3, Meta's Llama 3.2, Microsoft's Phi-4, and Qwen's Qwen3.

This repository is a fork of [felixrieseberg/clippy](https://github.com/felixrieseberg/clippy) focused on turning Clippy into a lightweight retro assistant UI that can eventually run on small hardware, such as a Raspberry Pi, while handing heavier LLM work to either local models or an OpenAI-compatible backend.

It's a love letter and homage to the late, great Clippy, the assistant from Microsoft Office 1997. The character was designed by illustrator Kevan Atteberry, who created more than 15 potential characters for Microsoft's Office Assistants. This app is not affiliated, approved, or supported by Microsoft. Consider it software art. If you don't like it, consider it software satire.

It is also meant to be a reference implementation of [@electron/llm](https://github.com/electron/llm), hoping to help other developers of Electron apps make use of local language models.

## What This Fork Changes

This fork keeps the original spirit of Clippy, but the most important direction is separating the nostalgic Clippy interface from the machine doing the model inference. That makes the app more practical for Raspberry Pi OS, kiosk-style desktop use, small-screen retro builds, and future thin-client assistant setups.

### Remote backend groundwork

- Adds settings state for selecting between local and OpenAI-compatible backends.
- Adds settings fields for remote API base URL, API key, and model name.
- Lays the foundation for using Clippy as a lightweight front end while another machine, server, or API-compatible service handles the heavier LLM work.
- Makes the fork better suited for Raspberry Pi and retro-computing builds where the UI hardware may not be powerful enough to run larger models locally.

This is the main architectural difference from the upstream project. The original app is centered on local GGUF models through Llama.cpp. This fork begins moving toward a split model where Clippy can remain the fun desktop character while the actual model backend can be local or remote.

### Raspberry Pi / Linux ARM64 support

- Adds Linux ARM64-specific Electron startup handling for Raspberry Pi-style environments.
- Disables hardware acceleration and GPU compositing on Linux ARM64 to avoid rendering and transparency issues seen on Raspberry Pi OS.
- Enables transparent visuals for cleaner frameless-window behavior on Linux ARM64.
- Keeps those changes guarded behind `process.platform === "linux" && process.arch === "arm64"`, so Windows, macOS, and non-ARM64 Linux builds should not receive the Raspberry Pi-specific GPU changes.

### Better startup chat behavior

- Makes the saved `alwaysOpenChat` preference more reliable on launch.
- Reads the saved state directly during startup before opening the chat window.
- Avoids depending only on renderer state timing, which can cause the chat window to not appear when expected.

### Chat window placement and sizing

- Adds configurable chat window width and height.
- Defaults the chat window to `500x360`, which works better on small displays.
- Adds support for centering the chat window on the primary display.
- Retains the original popover-style positioning when centered mode is disabled.
- Repositions the chat window after load to fight timing issues from Electron/window-manager behavior.

### Window behavior improvements

- Keeps Clippy and chat always-on-top behavior configurable.
- Uses a transparent, frameless main Clippy window.
- Disables background throttling for the main window so Clippy remains responsive in kiosk-like setups.
- Avoids closing and recreating the chat portal unnecessarily, which makes toggling the chat feel more stable.

### Auto-update control

- Adds a persisted `disableAutoUpdate` setting.
- Allows the app to skip updater initialization when auto-updates are disabled.
- This is useful for forked builds, offline systems, and Raspberry Pi installations where upstream update behavior is not desired.

## Features

- Simple, familiar, and classic chat interface. Send messages to your models, get a response.
- Batteries included: No complicated setup. Just open the app and chat away. Thanks to llama.cpp and `node-llama-cpp`, the app will automatically discover the most efficient way to run your models (Metal, CUDA, Vulkan, etc).
- Custom models, prompts, and parameters: Load your own downloaded models and play with the settings.
- Offline-first local model support, with fork-level groundwork for OpenAI-compatible remote backend settings.

## Notes for This Fork

This fork is primarily maintained for Raspberry Pi OS and retro-computing style setups. The Raspberry Pi-specific runtime changes are guarded so they should not apply to Windows or macOS builds, but the chat window behavior changes are cross-platform and may affect the desktop experience on every operating system.

The remote backend work currently exists as application state and configuration groundwork. Before describing this as a complete remote inference feature, verify that the request/response path is fully wired to the OpenAI-compatible backend in the UI and chat pipeline.

The original project's release, signing, and update flow were designed for the upstream repository. If you are building this fork yourself, unsigned local builds are the simplest path. Before publishing public releases, review the app metadata, signing configuration, update repository, and release workflow so published builds point to this fork instead of upstream.

## Non-Features

Countless little chat apps for local LLMs exist out there. Many of them are likely better, and that's okay. This project isn't trying to be your best chat bot. I'd like you to enjoy a weird mix of nostalgia for 1990s technology paired with one the most magical technologies we can run on our computers in 2025.

## Downloading More Models

Clippy supports, thanks to Llama.cpp, most GGUF models. You can find GGUF models in plenty of online sources. I tend to go with models quantized by [TheBloke](https://huggingface.co/thebloke) or [Unsloth](https://huggingface.co/unsloth).

## Acknowledgements

Thanks to:

- [Felix Rieseberg](https://github.com/felixrieseberg) for creating the original Clippy app this fork is based on.
- I am so grateful to Microsoft, not only for everything they've done for Electron, but also for giving us one of the most iconic characters and designs of computing history.
- [Kevan Atteberry](https://www.kevanatteberry.com/) for Clippy.
- [Jordan Scales (@jdan)](https://github.com/jdan) for the Windows 98 design.
- [Pooya Parsa (@pi0)](https://github.com/pi0) for being the person, as far as I know, to extract the length of each frame from the Clippy spritesheet.
- [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) for squeezing llama.cpp into Node.js.
