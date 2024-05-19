import { QMainWindow, QIcon, QWidget, QStatusBar, QBoxLayout, QGridLayout, QLineEdit, FlexLayout, Direction, QGroupBox, QCheckBox, QRadioButton, QLabel, QSlider, Orientation, TickPosition, AlignmentFlag, QPushButton } from '@nodegui/nodegui';
import path from 'path'

const VERSION = '0.0.1';
export const SLIDER_MAX_VALUE = 1000;

export interface MainWindow {
  win?: QMainWindow,
  rootLayout?: QBoxLayout,
  rng: {
    injectSeedGroupBox?: QGroupBox,
    randomSeedRadio?: QRadioButton,
    setSeedRadio?: QRadioButton,
    setSeedInput?: QLineEdit,
    jokerInput?: QLineEdit,
    animInput?: QLineEdit
  },
  buttons: {
    load?: QPushButton,
    save?: QPushButton,
  },
  driver: {
    install?: QPushButton,
    uninstall?: QPushButton,
  },
  statusbar?: QStatusBar,
};

const mainWindow: MainWindow = {
  rng: {},
  buttons: {},
  driver: {},
  statusbar: undefined,
};

function createWindow() {
  mainWindow.win = new QMainWindow();
  mainWindow.win.setWindowTitle("FF7 SCMSquare v" + VERSION);

  mainWindow.statusbar = new QStatusBar();
  mainWindow.statusbar.setSizeGripEnabled(false);
  mainWindow.win.setStatusBar(mainWindow.statusbar);
  updateStatus(false);

  const iconPath = path.resolve(__dirname, "speed-square-icon.png")
  const icon = new QIcon(iconPath)
  mainWindow.win.setWindowIcon(icon)

  mainWindow.win.setStyleSheet(
    `
      #approot {
        background-color: rgb(212, 208, 200);
        height: '100%';
        align-items: 'center';
        justify-content: 'center';
      }
      #fpsgroup, #tweaksgroup, #injectseedgroup {
        color: #555;
        font-size: 14px;
      }
    `);
}

export function updateStatus(connected: boolean, text?: string) {
  let message = "Status: " + (connected ? 'Connected' : 'Disconnected')
  if (text) message += " - " + text;
  mainWindow.statusbar?.showMessage(message);
}

function createRoot() {
  const centralWidget = new QWidget();
  centralWidget.setObjectName("approot");
  mainWindow.rootLayout = new QBoxLayout(Direction.TopToBottom);
  centralWidget.setLayout(mainWindow.rootLayout);
  mainWindow.win?.setCentralWidget(centralWidget);
}

function createInjectSeedGroup() {
  const groupBox = new QGroupBox();
  const groupBoxLayout = new QBoxLayout(Direction.LeftToRight);
  groupBox.setObjectName("injectseedgroup");
  groupBox.setLayout(groupBoxLayout);
  groupBox.setTitle("Inject Battle RNG Seed");
  groupBox.setCheckable(true);
  groupBox.setChecked(false);
  mainWindow.rootLayout?.addWidget(groupBox);
  mainWindow.rng.injectSeedGroupBox = groupBox;

  const radioRandomSeed = new QRadioButton();
  radioRandomSeed.setText("Random seed");
  radioRandomSeed.setInlineStyle("color: black;")
  radioRandomSeed.setChecked(true);
  groupBoxLayout.addWidget(radioRandomSeed); 
  mainWindow.rng.randomSeedRadio = radioRandomSeed;

  const radioSetSeed = new QRadioButton();
  radioSetSeed.setText("Set seed:");
  radioSetSeed.setInlineStyle("color: black;")
  groupBoxLayout.addWidget(radioSetSeed); 
  mainWindow.rng.setSeedRadio = radioSetSeed;

  const inputSetSeed = new QLineEdit();
  inputSetSeed.setInlineStyle("width: 70px; background-color: #fff; color: #000;");
  groupBoxLayout.addWidget(inputSetSeed);  
  mainWindow.rng.setSeedInput = inputSetSeed;

  const inputJoker = new QLineEdit();
  inputJoker.setInlineStyle("width: 70px; background-color: #fff; color: #000;");
  groupBoxLayout.addWidget(inputJoker);
  mainWindow.rng.jokerInput = inputJoker;

  const inputAnim = new QLineEdit();
  inputAnim.setInlineStyle("width: 70px; background-color: #fff; color: #000;");
  groupBoxLayout.addWidget(inputAnim);
  mainWindow.rng.animInput = inputAnim;
}

function createButtons() {
  const buttonGroup = new QGroupBox();
  const buttonGroupLayout = new QBoxLayout(Direction.LeftToRight);
  buttonGroupLayout.setSpacing(5);
  buttonGroup.setLayout(buttonGroupLayout);
  mainWindow.rootLayout?.addWidget(buttonGroup);
  buttonGroup.setInlineStyle('flex-direction: row; width: 100%;');

  const loadButton = new QPushButton();
  loadButton.setText("Revert to saved");
  loadButton.setInlineStyle("color: black;")
  buttonGroupLayout.addWidget(loadButton);
  mainWindow.buttons.load = loadButton;

  const saveButton = new QPushButton();
  saveButton.setText("Save as default");
  saveButton.setInlineStyle("color: black;")
  buttonGroupLayout.addWidget(saveButton);
  mainWindow.buttons.save = saveButton;
}

function createDriverGroup() {
  const buttonGroup = new QGroupBox();
  buttonGroup.setTitle("FPS Fix driver")
  const buttonGroupLayout = new QBoxLayout(Direction.LeftToRight);
  buttonGroupLayout.setSpacing(5);
  buttonGroup.setLayout(buttonGroupLayout);
  mainWindow.rootLayout?.addWidget(buttonGroup);
  buttonGroup.setInlineStyle('flex-direction: row; width: 100%;');

  const installButton = new QPushButton();
  installButton.setText("Install");
  installButton.setInlineStyle("color: black;")
  buttonGroupLayout.addWidget(installButton);
  mainWindow.driver.install = installButton;

  const uninstallButton = new QPushButton();
  uninstallButton.setText("Uninstall");
  uninstallButton.setInlineStyle("color: black;")
  buttonGroupLayout.addWidget(uninstallButton);
  mainWindow.driver.uninstall = uninstallButton;
}

export function createMainWindow() {
  createWindow();
  createRoot();
  createDriverGroup();
  createInjectSeedGroup();
  createButtons();

  mainWindow.win?.show();
  return mainWindow;
}