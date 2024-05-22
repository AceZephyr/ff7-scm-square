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
  win.rng.jokerInput?.setText(state.rng.joker);
  win.rng.animInput?.setText(state.rng.anim);
  win.rng.isHexInput?.setChecked(state.rng.isHex);

  win.rng.fileGroupBox?.setChecked(state.rng.fileAuto)
  win.rng.fileNumInput?.setText(state.rng.fileNum);
  win.rng.slotNumInput?.setText(state.rng.slotNum);

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
  const configSourcePath = path.resolve(process.cwd(), 'driver', 'FFNx.toml');
  const configDstPath = path.resolve(state.driver.gamePath, 'FFNx.toml');

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

  // Copy the config file if it doesn't exist
  if (!fs.existsSync(configDstPath)) {
    fs.copyFileSync(configSourcePath, configDstPath);
  }

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
  win.rng.jokerInput?.addEventListener('textChanged', async value => {
    state.rng.joker = value;
  })
  win.rng.animInput?.addEventListener('textChanged', async value => {
    state.rng.anim = value;
  })
  win.rng.fileNumInput?.addEventListener('textChanged', async value => {
    state.rng.fileNum = value;
  })
  win.rng.slotNumInput?.addEventListener('textChanged', async value => {
    state.rng.slotNum = value;
  })
  win.rng.isHexInput?.addEventListener('toggled', value => {
    state.rng.isHex = value;
  })
  win.rng.fileGroupBox?.addEventListener('toggled', value => {
    state.rng.fileAuto = value;
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

  await ff7.updateInject();
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
