# Voxel Realms Project Rules & Architectural Guidelines

## 1. Multiplayer Synchronization Invariant for Creative Tools
- Every client-side feature that modifies blocks in bulk (prefabs, structures, terraforming), spawns living entities (NPC animals), or mounts dynamic 3D objects (screens, billboards) in multiplayer must follow an authoritative dual pipeline:
  1. **Offline Mode**: Instantiate directly in local client memory and Three.js scene.
  2. **Online Mode**: Transmit an authoritative network packet (`block_modify_batch`, `animal_spawn`, `billboard_create`) to the WebSocket server. The server persists the changes in the room's `GameState` and broadcasts them to all clients in that room. The local client must suppress duplicate local instantiation when receiving the server broadcast.
  3. **Undo Consistency**: Undoing an action (Ctrl+Z) must remove both local voxels/meshes and emit a removal packet (`billboard_remove`, block rollback) to wipe the item synchronously across all peer screens.

## 2. Room Switching Packet Sequence Invariant
- When a client switches rooms or joins a private room:
  - The server must dispatch `SWITCH_ROOM_CONFIRM` **before** dispatching `INIT`.
  - Client-side room reset listeners clear existing avatars, deltas, and entities upon `SWITCH_ROOM_CONFIRM`.
  - Dispatched `INIT` subsequently populates the new room's authoritative chunks, deltas, and billboards without risk of premature erasure.
  - Room switching must preserve admin authorizations (`meta.isAdmin`, `meta.adminEmail`) in the target room.

## 3. Android WebView File & Media Permissions
- For map uploads (`.vrealm.json`) and photo selection on modern Android versions (Android 13/14+):
  - Declare `READ_MEDIA_IMAGES`, `READ_MEDIA_VISUAL_USER_SELECTED`, and `READ_EXTERNAL_STORAGE` in `AndroidManifest.xml`.
  - Implement `WebChromeClient.onShowFileChooser` with `ClipData` multi-selection handling and generic fallback intents.
