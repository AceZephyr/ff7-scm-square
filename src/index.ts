import { QApplication, SliderAction } from '@nodegui/nodegui';
import { createMainWindow, MainWindow, SLIDER_MAX_VALUE, updateStatus } from './ui/main-window';
import { watch } from 'vue';
import { RngMode, state } from './state';
import { Configuration } from './configuration';
import { FF7, FF7Address } from './ff7';
import { DataType } from './memoryjs-mock';
import { debounce } from 'throttle-debounce';
import { encodeText } from './lib/fftext';

const app = QApplication.instance();
const config = new Configuration('settings.json', state);
const ff7 = new FF7();

type GameModule = 'field' | 'world' | 'battle';
const mapModules = (cb: (type: GameModule) => void) => 
  (['field', 'world', 'battle'] as GameModule[]).forEach(type => cb(type));

function updateFPSUI(win: MainWindow, type: GameModule) {
  win.fps[type].slider?.setSliderPosition(state.fps[type].value);
  console.log("State value: " + state.fps[type].value)
  console.log("Input value: " + win.fps[type].input?.text())
  if (state.fps[type].value !== parseInt(win.fps[type].input?.text() || '0')) {
    win.fps[type].input?.setText(state.fps[type].value + '');
  }
  win.fps[type].auto?.setChecked(state.fps[type].auto);
  win.fps[type].slider?.setEnabled(!state.fps[type].auto);
  win.fps[type].input?.setEnabled(!state.fps[type].auto);
}

function updateUI(win: MainWindow) {
  console.log(`updateUI`);

  // FPS Group
  mapModules(type => updateFPSUI(win, type));

  // Tweaks Group 
  win.tweaks.battleSwirlCheck?.setChecked(state.tweaks.battleSwirlFpsCap);
  // win.tweaks.menusCheck?.setChecked(state.tweaks.menusFpsCap);
  win.tweaks.pauseCheck?.setChecked(state.tweaks.disablePauseWhenUnfocused);

  // RNG Group
  win.rng.injectSeedGroupBox?.setChecked(state.rng.inject);
  win.rng.randomSeedRadio?.setChecked(state.rng.mode === RngMode.random);
  win.rng.setSeedRadio?.setChecked(state.rng.mode === RngMode.set);
  win.rng.setSeedInput?.setEnabled(state.rng.mode === RngMode.set);
  win.rng.setSeedInput?.setText(state.rng.seed);
}

const debouncedFF7Update = debounce(250, updateFF7Values);

function setupWatchers(win: MainWindow) {
  watch(() => state, () => {
    updateUI(win);
    updateStatus(state.app?.connected);
    debouncedFF7Update(); 
    updateFF7ValuesImmediate();
  }, {deep: true})
}

function loadConfig() {
  const data = config.load();
  if (!data) {
    return;
  }

  state.fps = data.fps;
  state.rng = data.rng;
  state.tweaks = data.tweaks;
}

async function writeRNGSeed() {
  if (state.rng.inject) {
    await ff7.applyRNGSeedPatch()
    if (state.rng.mode === RngMode.set && state.rng.seed !== '') {
      await ff7.writeMemory(ff7.battleRNGSeedAddr, parseInt(state.rng.seed), DataType.int);
      const text = encodeText(`SpeedSquare is active. Set Seed: ${parseInt(state.rng.seed)}`)
      await ff7.writeMemory(FF7Address.SpeedSquareTextAddr, text, DataType.buffer);
      console.log("Set Seed mode active, seed:", state.rng.seed)
    } else if (state.rng.mode === RngMode.random) {
      const randomSeed = Math.floor(Math.random() * 0x7FFF)
      await ff7.writeMemory(ff7.battleRNGSeedAddr, randomSeed, DataType.int);
      const text = encodeText(`SpeedSquare is active. Random Seed: ${randomSeed}`)
      await ff7.writeMemory(FF7Address.SpeedSquareTextAddr, text, DataType.buffer);
      console.log("Random seed mode active, seed:", randomSeed)
    }
  } else {
    await ff7.revertRNGSeedPatch()
    const text = encodeText(`SpeedSquare is active. Default RNG Seed.`)
    await ff7.writeMemory(FF7Address.SpeedSquareTextAddr, text, DataType.buffer);
    console.log("No RNG seed injected")
  }
}

function setupListeners(win: MainWindow) {
  // FPS Group
  mapModules(type => {
    win.fps[type].slider?.addEventListener('valueChanged', value => {
      state.fps[type].value = value
    });
    win.fps[type].input?.addEventListener('textChanged', value => {
      let number = parseInt(value.trim())
      if (/^\d+$/.test(value.trim())) {
        if (number < 0) number = 0
        if (number > SLIDER_MAX_VALUE) number = SLIDER_MAX_VALUE
        state.fps[type].value = number
      }
    });
    win.fps[type].auto?.addEventListener('toggled', value => {state.fps[type].auto = value});
  });

  // Tweaks group
  win.tweaks.battleSwirlCheck?.addEventListener('toggled', value => {
    state.tweaks.battleSwirlFpsCap = value;
  });
  // win.tweaks.menusCheck?.addEventListener('toggled', value => {
  //   state.tweaks.menusFpsCap = value;
  // });
  win.tweaks.pauseCheck?.addEventListener('toggled', value => {
    state.tweaks.disablePauseWhenUnfocused = value;
  });

  // RNG group
  win.rng.injectSeedGroupBox?.addEventListener('toggled', value => {
    state.rng.inject = value;
  })
  win.rng.setSeedRadio?.addEventListener('toggled', () => {
    state.rng.mode = RngMode.set;
  })
  win.rng.randomSeedRadio?.addEventListener('toggled', () => {
    state.rng.mode = RngMode.random;
  })
  win.rng.setSeedInput?.addEventListener('textChanged', async value => {
    state.rng.seed = value;
  })

  // Buttons group
  win.buttons.load?.addEventListener('clicked', loadConfig)

  win.buttons.save?.addEventListener('clicked', () => {
    config.save(state);
  })
}

async function updateFPS(address: number, value: number, initial: number, subtract: number) {
  const initialFPS = initial;
  const userFPS = value;
  const fpsValue = userFPS / (SLIDER_MAX_VALUE / 2) - 1; // clamps the value to -1 ... 1
  const targetFPS = initialFPS - (subtract * fpsValue);
  try {
    await ff7.writeMemory(address, targetFPS, DataType.double);
    console.log("FF7 Values updated", fpsValue)
    await writeRNGSeed();
  } catch(e) {
    console.error("Error while writing memory: ")
    console.error(e);
  }
}

async function updateFF7Values() {
  // Skip if game is not running
  if (!state.app?.connected) return;

  await updateFPS(FF7Address.FieldFPSValue, state.fps.field.value, 333000, 300000)
  await updateFPS(FF7Address.BattleFPSValue, state.fps.battle.value, 666000, 630000)
}

async function updateFF7ValuesImmediate() {
  // Skip if game is not running
  if (!state.app?.connected) return;

  if (state.tweaks.battleSwirlFpsCap) {
    ff7.startTransaction('battleSwirl');
    await ff7.patchBattleSwirl();
    ff7.stopTransaction();
  } else {
    await ff7.rollbackTransaction('battleSwirl');
  }

  if (state.tweaks.disablePauseWhenUnfocused) {
    ff7.startTransaction('disablePause');
    await ff7.patchWindowUnfocus();
    ff7.stopTransaction();
  } else {
    await ff7.rollbackTransaction('disablePause');
  }
}

(function() {
  const mainWindow = createMainWindow();
  setupWatchers(mainWindow);
  setupListeners(mainWindow);
  loadConfig();
  updateUI(mainWindow);

  ff7.start();
  ff7.onConnect(() => {
    state.app.connected = true;
    updateStatus(true);
    updateFF7Values();
  });
  ff7.onDisconnect(() => {
    state.app.connected = false;
  });

})();