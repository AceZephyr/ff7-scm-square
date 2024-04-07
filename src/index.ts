import { QApplication, SliderAction, QFileDialog, FileMode } from '@nodegui/nodegui';
import { QMessageBox, ButtonRole, QPushButton } from '@nodegui/nodegui';
import { createMainWindow, MainWindow, SLIDER_MAX_VALUE, updateStatus } from './ui/main-window';
import { watch } from 'vue';
import { RngMode, state } from './state';
import { Configuration } from './configuration';
import { FF7, FF7Address } from './ff7';
import { DataType } from './memoryjs-mock';
import { debounce } from 'throttle-debounce';
import { encodeText } from './lib/fftext';
import fs, { copyFileSync } from 'fs';
import path from 'path';

const app = QApplication.instance();
const config = new Configuration('settings.json', state);
const ff7 = new FF7();

type GameModule = 'field' | 'world' | 'battle';
const mapModules = (cb: (type: GameModule) => void) => 
  (['field', 'world', 'battle'] as GameModule[]).forEach(type => cb(type));

function alert(title: string, text: string) {
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(text);
  const accept = new QPushButton();
  accept.setText('Ok');
  messageBox.addButton(accept, ButtonRole.AcceptRole);
  messageBox.exec();
}

function confirm(title: string, text: string) {
  const messageBox = new QMessageBox();
  messageBox.setText(title);
  messageBox.setInformativeText(text);
  const accept = new QPushButton();
  accept.setText('Yes');
  messageBox.addButton(accept, ButtonRole.AcceptRole);
  const reject = new QPushButton();
  reject.setText('No');
  messageBox.addButton(reject, ButtonRole.RejectRole);
  return messageBox.exec();
}

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

  // Driver Group
  win.driver.install?.setEnabled(!state.driver.installed);
  win.driver.uninstall?.setEnabled(state.driver.installed);
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
  state.driver = data.driver || {};
}

function installDriver() {
  const fileDialog = new QFileDialog();
  fileDialog.setFileMode(FileMode.Directory);
  fileDialog.exec();
  state.driver.gamePath = fileDialog.selectedFiles()[0];

  // Check for ff7input.cfg file
  const ff7InputPath = path.resolve(process.env.USERPROFILE || '', 'Documents', 'Square Enix', 'FINAL FANTASY VII Steam', 'ff7input.cfg');
  if (fs.existsSync(ff7InputPath)) {
    // Read the first byte of the file and check whether it's 00
    const ff7Input = fs.readFileSync(ff7InputPath);
    if (ff7Input[0] === 0) {
      const result = confirm("Malformed input config detected!", "Your ff7input.cfg file seems to be malformed. Would you like to fix it by resetting the controls to defaults?")
      if (result === 0) {
        const ff7InputDefaultPath = path.resolve(process.cwd(), 'driver', 'ff7input.cfg');
        copyFileSync(ff7InputDefaultPath, ff7InputPath);
      }
    }
  }

  if (!state.driver.gamePath) {
    return;
  }

  const driverSourcePath = path.resolve(process.cwd(), 'driver', 'AF3DN.P');
  const driverShadersPath = path.resolve(process.cwd(), 'driver', 'shaders');
  const driverGamePath = path.resolve(state.driver.gamePath, 'AF3DN.P');
  const driverBackupPath = path.resolve(state.driver.gamePath, 'AF3DN.P.bak');

  // If driver does not exist, alert
  if (!fs.existsSync(driverGamePath)) {
    alert("Driver not found", "Please select the root directory of your FF7 installation that contains the AF3DN.P file.");
    return;
  }

  // Check if backup exists
  if (fs.existsSync(driverBackupPath)) {
    state.driver.installed = true;
    alert("Already installed", "The driver was already installed, no action was taken.");
    return;
  }

  fs.copyFileSync(driverGamePath, driverBackupPath);
  fs.copyFileSync(driverSourcePath, driverGamePath);

  // Copy all files from shaders directory to game directory
  fs.mkdirSync(driverShadersPath, {recursive: true});
  fs.readdirSync(driverShadersPath).forEach(file => {
    // Skip directories
    if (fs.lstatSync(path.resolve(driverShadersPath, file)).isDirectory()) {
      return;
    }
    fs.copyFileSync(path.resolve(driverShadersPath, file), path.resolve(state.driver.gamePath as string, 'shaders', file));
  });

  state.driver.installed = true;
  config.save(state);
}

function uninstallDriver() {
  if (!state.driver.gamePath) {
    return;
  }

  const driverGamePath = path.resolve(state.driver.gamePath, 'AF3DN.P');
  const driverBackupPath = path.resolve(state.driver.gamePath, 'AF3DN.P.bak');

  // Check if backup exists
  if (!fs.existsSync(driverBackupPath)) {
    state.driver.installed = false;
    return;
  }

  fs.copyFileSync(driverBackupPath, driverGamePath);

  // Remove the backup file
  fs.unlinkSync(driverBackupPath);

  state.driver.installed = false;
  config.save(state);
}

function checkDriver() {
  const driverBackupPath = path.resolve(state.driver.gamePath + '', 'AF3DN.P.bak');

  if (!state.driver.gamePath || !fs.existsSync(driverBackupPath) ) {
    state.driver.installed = false;
    
  } else {
    state.driver.installed = true;
  }
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

  // Driver group
  win.driver.install?.addEventListener('clicked', installDriver)
  win.driver.uninstall?.addEventListener('clicked', uninstallDriver)
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
  checkDriver();
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