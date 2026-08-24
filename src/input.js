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

export class InputController {
  constructor() {
    this.state = { forward: false, backward: false, left: false, right: false };
    window.addEventListener('keydown', (e) => this.setKey(e, true));
    window.addEventListener('keyup', (e) => this.setKey(e, false));
  }

  setKey(e, value) {
    const action = KEY_MAP[e.code];
    if (!action) return;

    this.state[action] = value;
    // Stop arrow keys from scrolling the page.
    e.preventDefault();
  }
}
