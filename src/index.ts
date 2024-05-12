import { QApplication, QFileDialog, FileMode } from '@nodegui/nodegui';
import { QMessageBox, ButtonRole, QPushButton } from '@nodegui/nodegui';
import { createMainWindow, MainWindow, updateStatus } from './ui/main-window';
import { watch } from 'vue';
import { RngMode, state } from './state';
import { Configuration } from './configuration';
import { FF7 } from './ff7';
import { DataType } from './memoryjs-mock';
import { debounce } from 'throttle-debounce';
import fs, { copyFileSync } from 'fs';
import path from 'path';

const app = QApplication.instance();
const config = new Configuration('settings.json', state);
const ff7 = new FF7();

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

function updateUI(win: MainWindow) {
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
  }, {deep: true})
}

function loadConfig() {
  const data = config.load();
  if (!data) {
    return;
  }

  state.rng = data.rng;
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
    if (state.rng.mode === RngMode.set && state.rng.seed !== '') {
      ff7.currentRNGSeed = parseInt(state.rng.seed);
      ff7.currentRNGMode = RngMode.set;
      await ff7.writeMemory(ff7.battleRNGSeedAddr, parseInt(state.rng.seed), DataType.int);
      console.log("Set Seed mode active, seed:", state.rng.seed)
    } else if (state.rng.mode === RngMode.random) {
      const randomSeed = ff7.getRandomSeed();
      ff7.currentRNGSeed = randomSeed;
      ff7.currentRNGMode = RngMode.random;
      await ff7.writeMemory(ff7.battleRNGSeedAddr, randomSeed, DataType.int);
      console.log("Random seed mode active, seed:", randomSeed)
    }
    await ff7.applyRNGSeedPatch()
  } else {
    ff7.currentRNGMode = RngMode.none;
    console.log("No RNG seed injected")
    await ff7.revertRNGSeedPatch()
  }
}

function setupListeners(win: MainWindow) {
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

async function updateFF7Values() {
  // Skip if game is not running
  if (!state.app?.connected) return;

  await writeRNGSeed();
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
    state.app.connected = true; // fires updateFF7Values()
    updateStatus(true);
  });
  ff7.onDisconnect(() => {
    state.app.connected = false;
  });
})();
