const KEY_MAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'backward',
  ArrowDown: 'backward',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

const TOUCH_BUTTON_MAP = {
  'btn-forward': 'forward',
  'btn-back': 'backward',
  'btn-left': 'left',
  'btn-right': 'right',
};

export class InputController {
  constructor() {
    this.state = { forward: false, backward: false, left: false, right: false };
    window.addEventListener('keydown', (e) => this.setKey(e, true));
    window.addEventListener('keyup', (e) => this.setKey(e, false));
    this.bindTouchControls();
  }

  setKey(e, value) {
    const action = KEY_MAP[e.code];
    if (!action) return;

    this.state[action] = value;
    // Stop arrow keys from scrolling the page.
    e.preventDefault();
  }

  bindTouchControls() {
    for (const [id, action] of Object.entries(TOUCH_BUTTON_MAP)) {
      const btn = document.getElementById(id);
      if (!btn) continue;

      // Pointer events (not touchstart/touchend) so each button tracks
      // its own pointer independently — needed for holding e.g. forward
      // and left down at once with two fingers.
      const press = (e) => {
        e.preventDefault();
        this.state[action] = true;
      };
      const release = (e) => {
        e.preventDefault();
        this.state[action] = false;
      };

      btn.addEventListener('pointerdown', press);
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('pointerleave', release);
    }
  }
}
