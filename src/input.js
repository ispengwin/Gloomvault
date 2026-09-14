// Keyboard + mouse (pointer lock) input, PLUS touch controls for iPad/phones.
// Touch simply feeds the SAME methods the game already reads (down/mouseDX/
// mouseDown...), so no game logic needs to change.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // edge: pressed this frame
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseButtons = new Set();
    this.mousePressed = new Set(); // edge
    this.locked = false;

    // Touch state
    this.isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    this.touchMove = { x: 0, y: 0 };   // normalized -1..1 from virtual joystick
    this.touchButtons = new Set();      // 'attack' | 'guard'
    this.touchPressed = new Set();      // edge for tap-style buttons
    this._lookId = null;                // pointerId driving the look camera
    this._lookLast = null;

    window.addEventListener('keydown', (e) => {
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.mouseButtons.has(e.button)) this.mousePressed.add(e.button);
      this.mouseButtons.add(e.button);
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    if (this.isTouch) this._setupTouchLook();
  }

  // ---- Touch: dragging on the right half of the screen looks around ----
  _setupTouchLook() {
    const el = this.canvas;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      // Left third is reserved for the joystick (handled by DOM buttons);
      // anywhere on the right drives the camera look.
      if (e.clientX > window.innerWidth * 0.35 && this._lookId === null) {
        this._lookId = e.pointerId;
        this._lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this._lookId || !this._lookLast) return;
      this.mouseDX += (e.clientX - this._lookLast.x) * 1.4;
      this.mouseDY += (e.clientY - this._lookLast.y) * 1.4;
      this._lookLast = { x: e.clientX, y: e.clientY };
    });
    const end = (e) => {
      if (e.pointerId === this._lookId) { this._lookId = null; this._lookLast = null; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // Called by the on-screen joystick (main.js) — vec components in -1..1.
  setJoystick(x, y) { this.touchMove.x = x; this.touchMove.y = y; }

  // Called by on-screen buttons. `held` for continuous (guard), tap for others.
  setTouchButton(name, held) {
    if (held) {
      if (!this.touchButtons.has(name)) this.touchPressed.add(name);
      this.touchButtons.add(name);
    } else {
      this.touchButtons.delete(name);
    }
  }
  tapTouchButton(name) { this.touchPressed.add(name); this.touchButtons.add(name); this._releaseNext = this._releaseNext || new Set(); this._releaseNext.add(name); }

  requestLock() { if (!this.isTouch) this.canvas.requestPointerLock(); }
  exitLock() { if (this.locked) document.exitPointerLock(); }

  // ---- Unified queries: merge keyboard/mouse with touch ----
  down(code) {
    if (this.keys.has(code)) return true;
    // Map movement keys to the virtual joystick
    const t = this.touchMove;
    const dead = 0.25;
    if (code === 'KeyW') return t.y < -dead;
    if (code === 'KeyS') return t.y > dead;
    if (code === 'KeyA') return t.x < -dead;
    if (code === 'KeyD') return t.x > dead;
    if (code === 'ShiftLeft') return (Math.hypot(t.x, t.y) > 0.92); // push stick fully = sprint
    return false;
  }
  justPressed(code) {
    if (this.pressed.has(code)) return true;
    if (code === 'Space') return this.touchPressed.has('dodge');
    if (code === 'KeyQ') return this.touchPressed.has('torch');
    return false;
  }
  mouseDown(btn) {
    if (this.mouseButtons.has(btn)) return true;
    if (btn === 0) return this.touchButtons.has('attack');
    if (btn === 2) return this.touchButtons.has('guard');
    return false;
  }
  mouseJustPressed(btn) {
    if (this.mousePressed.has(btn)) return true;
    if (btn === 0) return this.touchPressed.has('attack');
    if (btn === 2) return this.touchPressed.has('guard');
    return false;
  }

  // Call at end of each frame to clear per-frame edges + deltas.
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.touchPressed.clear();
    // Auto-release tap-style buttons (dodge/torch/attack taps) after 1 frame.
    if (this._releaseNext) { this._releaseNext.forEach(n => this.touchButtons.delete(n)); this._releaseNext.clear(); }
  }
}
