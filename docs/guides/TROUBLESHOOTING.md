# Troubleshooting Guide

**Last Updated:** February 15, 2026

This guide helps you diagnose and resolve common issues in USDA Composer.

---

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Common Errors](#common-errors)
3. [Performance Issues](#performance-issues)
4. [Build and Dependency Problems](#build-and-dependency-problems)
5. [Test Failures](#test-failures)
6. [3D Rendering Issues](#3d-rendering-issues)
7. [File Loading Problems](#file-loading-problems)
8. [State Management Debugging](#state-management-debugging)
9. [Browser Compatibility](#browser-compatibility)
10. [FAQ](#faq)

---

## Quick Diagnostics

### Step 1: Check Browser Console

Press **F12** to open DevTools and check the Console tab for errors.

**Common Error Patterns:**

- `Uncaught TypeError`: Check if variables are defined
- `Failed to fetch`: Network or CORS issue
- `WebGL context lost`: GPU issue or memory exhaustion
- `Module not found`: Build or import path issue

### Step 2: Check Network Tab

Look for failed requests or slow responses.

### Step 3: Verify Setup

```bash
# Check Node version (should be 20+)
node --version

# Check npm version (should be 9+)
npm --version

# Verify dependencies are installed
npm list

# Run in development mode
npm run dev
```

### Step 4: Clear Cache and Restart

```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules
npm install

# Clear Vite cache
rm -rf node_modules/.vite

# Restart dev server
npm run dev
```

---

## Common Errors

### Error: "Cannot read properties of undefined"

**Symptom:**

```
Uncaught TypeError: Cannot read properties of undefined (reading 'layerStack')
```

**Cause:** Accessing state before initialization or incorrect state shape

**Solution:**

```javascript
// ❌ Bad
const layers = store.getState().stage.layerStack;

// ✅ Good - Use optional chaining
const layers = store.getState().stage?.layerStack || [];

// ✅ Better - Check state first
const state = store.getState();
const layers =
  state.stage && state.stage.layerStack ? state.stage.layerStack : [];
```

---

### Error: "WebGL context lost"

**Symptom:**

- 3D viewport goes black
- Console error: "WebGL: CONTEXT_LOST_WEBGL"

**Causes:**

1. GPU memory exhausted (too many prims/meshes)
2. Browser tab suspended and restored
3. GPU driver crash

**Solutions:**

**Immediate Fix:**

```javascript
// Refresh the page
location.reload();
```

**Long-term Fixes:**

1. **Reduce Scene Complexity:**
   - Use entity placeholders instead of full geometry
   - Hide unnecessary layers
   - Limit visible prims

2. **Handle Context Loss:**

```javascript
// In ThreeScene.js
renderer.domElement.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  console.error("WebGL context lost");
  // Attempt recovery
  setTimeout(() => {
    renderer.forceContextRestore();
  }, 1000);
});
```

---

### Error: "Failed to parse USDA"

**Symptom:**

```
ParseError: Failed to parse USDA: Unexpected token at line 42
```

**Causes:**

- Malformed USDA syntax
- Unsupported USD features
- Corrupted file

**Solutions:**

1. **Validate USDA Syntax:**

```bash
# Use usdcat (if USD tools installed)
usdcat file.usda

# Or check syntax manually
```

2. **Check Common Issues:**

- Missing closing braces `}`
- Unescaped quotes in strings
- Invalid property types
- Incorrect indentation (affects parsing)

3. **Simplify File:**

```python
# Remove complex features and test incrementally
```

---

### Error: "Layer stack validation failed"

**Symptom:**

```
ValidationError: Duplicate layers found: scene.usda
```

**Cause:** Attempting to load the same file twice

**Solution:**

```javascript
// Check before adding layer
const existing = layerService.getLayerByPath(layerStack, filePath);
if (existing) {
  console.warn("Layer already loaded:", filePath);
  return;
}

// Add layer
store.dispatch(actions.addLayer(newLayer));
```

---

### Error: "Permission denied for promotion"

**Symptom:**
User cannot promote layer to Published

**Cause:** Insufficient user role permissions

**Solution:**

```javascript
import { USER_ROLES } from "./constants.js";

// Check current user role
const currentUser = store.getState().currentUser;
console.log("Current user:", currentUser);

// Only Project Managers can promote to Published
if (currentUser !== USER_ROLES.PROJECT_MANAGER) {
  alert("Only Project Managers can promote layers to Published");
  return;
}
```

---

## Performance Issues

### Slow 3D Rendering

**Symptoms:**

- Low FPS (frames per second)
- Laggy camera controls
- Delayed updates

**Diagnostics:**

```javascript
// Check FPS in console
let lastTime = Date.now();
function checkFPS() {
  const now = Date.now();
  const fps = 1000 / (now - lastTime);
  console.log("FPS:", fps.toFixed(1));
  lastTime = now;
  requestAnimationFrame(checkFPS);
}
checkFPS();
```

**Solutions:**

1. **Reduce Prim Count:**

```javascript
const primCount = primService.countPrims(hierarchy);
console.log("Total prims:", primCount);

// Target: < 10,000 prims for good performance
// Over 50,000 prims: expect slowdowns
```

2. **Use Entity Placeholders:**

```javascript
// Instead of loading full geometry, use placeholders
// Enable entity mode before staging prims
```

3. **Hide Unnecessary Layers:**

```javascript
// Toggle visibility for layers not in use
store.dispatch(actions.toggleLayerVisibility(layerId));
```

4. **Optimize Rendering:**

```javascript
// In ThreeScene.js, reduce render frequency
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x
```

---

### Slow File Loading

**Symptoms:**

- Long wait when loading large USDA files
- Browser becomes unresponsive

**Diagnostics:**

```javascript
console.time("File Load");
const content = await file.text();
console.timeEnd("File Load");

console.time("Parse");
const prims = USDA_PARSER.parseUsda(content);
console.timeEnd("Parse");
```

**Solutions:**

1. **Load Files Asynchronously:**

```javascript
async function loadFilesAsync(files) {
  for (const file of files) {
    await loadSingleFile(file);
    // Allow UI to update between files
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
```

2. **Show Loading Indicator:**

```javascript
showLoadingSpinner("Loading files...");
await loadFiles(files);
hideLoadingSpinner();
```

3. **Split Large Files:**

- Break monolithic files into smaller layers
- Load only necessary layers

---

### High Memory Usage

**Symptoms:**

- Browser tab crashes
- "Out of memory" errors
- System slowdown

**Diagnostics:**

```javascript
// Check memory (Chrome only)
if (performance.memory) {
  const used = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
  const total = (performance.memory.totalJSHeapSize / 1048576).toFixed(2);
  console.log(`Memory: ${used} MB / ${total} MB`);
}
```

**Solutions:**

1. **Unload Unused Layers:**

```javascript
store.dispatch(actions.unloadFile("old-file.usda"));
```

2. **Clear History:**

```javascript
// Clear old commits from memory
const recentCommits = Array.from(history.commits.values()).slice(-50);
```

3. **Dispose Three.js Objects:**

```javascript
// When removing meshes
mesh.geometry.dispose();
mesh.material.dispose();
scene.remove(mesh);
```

---

## Build and Dependency Problems

### Error: "Module not found"

**Symptom:**

```
Error: Cannot find module './nonexistent.js'
```

**Solutions:**

1. **Check Import Path:**

```javascript
// Use relative paths correctly
import { store } from "./core/index.js"; // Correct
import { store } from "core/index.js"; // Wrong (missing ./)
```

2. **Verify File Exists:**

```bash
ls -la src/core/index.js
```

3. **Check File Extension:**

```javascript
// Always include .js extension
import { store } from "./core/index.js"; // Correct
import { store } from "./core/index"; // May fail
```

---

### Error: "Vite HMR connection error"

**Symptom:**
Hot Module Replacement (HMR) not working, changes not reflected

**Solutions:**

1. **Restart Dev Server:**

```bash
# Stop (Ctrl+C) and restart
npm run dev
```

2. **Clear Vite Cache:**

```bash
rm -rf node_modules/.vite
npm run dev
```

3. **Check Port Conflicts:**

```bash
# If port 5173 is in use, specify different port
npm run dev -- --port 3000
```

---

### npm install Fails

**Symptom:**

```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solutions:**

1. **Use --legacy-peer-deps:**

```bash
npm install --legacy-peer-deps
```

2. **Clear Cache and Retry:**

```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

3. **Update Node.js:**

```bash
node --version  # Should be 20+
nvm install 20
nvm use 20
npm install
```

---

## Test Failures

### Tests Pass Locally but Fail in CI

**Causes:**

- Environment differences
- Timing issues (async tests)
- Missing mocks

**Solutions:**

1. **Check Test Environment:**

```javascript
// In test
console.log("Environment:", import.meta.env.MODE);
console.log("Node version:", process.version);
```

2. **Add Timeouts for Async Tests:**

```javascript
it("should load file", async () => {
  await vi.waitFor(
    () => {
      expect(file).toBeDefined();
    },
    { timeout: 5000 }
  ); // Increase timeout
});
```

3. **Ensure Mocks are Set:**

```javascript
// In setup.js, verify mocks are applied
console.log("WebGL mock:", typeof HTMLCanvasElement.prototype.getContext);
```

---

### Snapshot Tests Fail

**Symptom:**

```
Snapshot mismatch: expected value to match snapshot
```

**Solutions:**

1. **Review Changes:**

```bash
npm test -- --update
# Review diffs carefully before committing
```

2. **Platform Differences:**

- Line endings (CRLF vs LF)
- File paths (Windows vs Unix)

---

## 3D Rendering Issues

### Meshes Not Appearing

**Diagnostics:**

```javascript
// Check if meshes are created
console.log("Scene children:", scene.children.length);

// Check if meshes have geometry
scene.children.forEach((child) => {
  if (child.geometry) {
    console.log(
      "Mesh:",
      child.name,
      "vertices:",
      child.geometry.attributes.position.count
    );
  }
});

// Check camera position
console.log("Camera position:", camera.position);
```

**Solutions:**

1. **Camera Too Far/Close:**

```javascript
// Reset camera to see all objects
camera.position.set(10, 10, 10);
camera.lookAt(0, 0, 0);
controls.update();
```

2. **Meshes Outside View:**

```javascript
// Fit camera to scene bounds
const box = new THREE.Box3().setFromObject(scene);
const center = box.getCenter(new THREE.Vector3());
camera.lookAt(center);
```

3. **Missing Material:**

```javascript
// Ensure meshes have materials
if (!mesh.material) {
  mesh.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
}
```

---

### Incorrect Colors

**Issue:** Prims show wrong colors

**Solutions:**

1. **Check Color Format:**

```javascript
// USD uses linear RGB, Three.js may need conversion
const color = new THREE.Color(r, g, b); // 0-1 range

// If colors look wrong, check if colorizeByStatus is enabled
const colorize = store.getState().stage.colorizeByStatus;
console.log("Colorize by status:", colorize);
```

2. **Toggle Status Coloring:**

```javascript
store.dispatch(actions.toggleStatusColor());
```

---

## File Loading Problems

### CORS Errors

**Symptom:**

```
Access to fetch at 'file:///...' has been blocked by CORS policy
```

**Cause:** Loading local files via `file://` protocol

**Solution:**
Use a local server (Vite handles this automatically):

```bash
npm run dev
# Open http://localhost:5173 (not file://)
```

---

### File Not Recognized

**Issue:** `.usda` file loads but shows no content

**Solutions:**

1. **Check File Format:**

```bash
# Verify it's ASCII USD
head -n 5 file.usda
# Should start with: #usda 1.0
```

2. **Validate Syntax:**

```javascript
// Check for parse errors in console
```

3. **Check File Size:**

```javascript
console.log("File size:", file.size, "bytes");
// Very large files (>50MB) may cause issues
```

---

## State Management Debugging

### State Not Updating

**Diagnostics:**

```javascript
// Check if dispatch is called
store.subscribe("debug", (prevState, nextState) => {
  console.log("State changed:", {
    prev: prevState.sceneName,
    next: nextState.sceneName,
  });
});

// Dispatch and verify
store.dispatch(actions.setSceneName("Test"));
console.log("Current state:", store.getState().sceneName);
```

**Solutions:**

1. **Ensure Action is Correct:**

```javascript
const action = actions.setSceneName("New Name");
console.log("Action:", action);
// Should have type and payload
```

2. **Check Reducer:**

```javascript
// Reducer should return new state
// Never mutate state directly
```

---

### Subscriptions Not Firing

**Issue:** Subscriber callback not called

**Solutions:**

1. **Verify Subscription:**

```javascript
const unsubscribe = store.subscribe("test", (prev, next) => {
  console.log("Callback fired");
});

// Dispatch to trigger
store.dispatch(actions.setSceneName("Test"));

// Remember to unsubscribe later
unsubscribe();
```

2. **Check State Keys:**

```javascript
// Subscribe to correct keys
store.subscribe(["stage.layerStack"], callback); // Correct
```

---

## Browser Compatibility

### Supported Browsers

- **Chrome**: 90+ ✅
- **Firefox**: 88+ ✅
- **Safari**: 14+ ✅
- **Edge**: 90+ ✅

### Unsupported Browsers

- Internet Explorer (any version) ❌
- Old mobile browsers ❌

### Feature Detection

```javascript
// Check WebGL support
const canvas = document.createElement("canvas");
const gl =
  canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
if (!gl) {
  alert("WebGL not supported. Please use a modern browser.");
}
```

---

## FAQ

### Q: Why is the 3D viewport black?

**A:** Check:

1. Camera position (`camera.position`)
2. Scene has meshes (`scene.children.length`)
3. WebGL context (`renderer.getContext()`)
4. Browser DevTools for errors

---

### Q: Can I load `.usd` (binary) files?

**A:** No, only `.usda` (ASCII) files are supported. Convert binary USD to ASCII:

```bash
usdcat input.usd -o output.usda
```

---

### Q: How do I reset the application?

**A:**

```javascript
// Clear local storage (if used)
localStorage.clear();

// Reload page
location.reload();
```

---

### Q: Tests pass but application doesn't work

**A:** Tests may mock browser APIs. Check:

1. Run in actual browser (not headless)
2. Check browser console for errors
3. Verify mocks match real API behavior

---

### Q: How do I report a bug?

**A:**

1. Open browser DevTools (F12)
2. Copy errors from Console
3. Note steps to reproduce
4. Create issue at: https://github.com/anthropics/claude-code/issues
5. Include:
   - OS and browser version
   - Error messages
   - Steps to reproduce
   - Expected vs actual behavior

---

## Getting More Help

If this guide doesn't solve your issue:

1. **Check Other Documentation:**
   - [USER_GUIDE.md](./USER_GUIDE.md) - User features
   - [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md) - Dev setup
   - [ARCHITECTURE.md](../../ARCHITECTURE.md) - System design

2. **Search GitHub Issues:**
   - Existing issues may have solutions

3. **Ask for Help:**
   - Open a GitHub Discussion
   - Provide detailed error information
   - Include browser console output

---

**Last Updated:** February 15, 2026
