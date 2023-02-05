import { QApplication, QMainWindow, QWidget, QStatusBar, QBoxLayout, QGridLayout, QLineEdit, FlexLayout, Direction, QGroupBox, QCheckBox, QRadioButton, QLabel, FocusPolicy, QSlider, Orientation, TickPosition, AlignmentFlag, QPushButton } from '@nodegui/nodegui';

const VERSION = '1.0';

type FPSWidgetGroup = {
  input?: QLineEdit,
  slider?: QSlider,
  auto?: QCheckBox,
};

export interface MainWindow {
  win?: QMainWindow,
  rootLayout?: QBoxLayout,
  fps: {
    field: FPSWidgetGroup,
    world: FPSWidgetGroup,
    battle: FPSWidgetGroup,
  },
  tweaks: {
    battleSwirlCheck?: QCheckBox,
    menusCheck?: QCheckBox,
    pauseCheck?: QCheckBox,
  },
  rng: {
    injectSeedGroupBox?: QGroupBox,
    randomSeedRadio?: QRadioButton,
    setSeedRadio?: QRadioButton,
    setSeedInput?: QLineEdit,
  },
  buttons: {
    load?: QPushButton,
    save?: QPushButton,
  },
  statusbar?: QStatusBar,
};

const mainWindow: MainWindow = {
  fps: {field: {}, world: {}, battle: {}},
  tweaks: {},
  rng: {},
  buttons: {},
  statusbar: undefined,
};

function createWindow() {
  mainWindow.win = new QMainWindow();
  mainWindow.win.setWindowTitle("FF7 Speed Square v" + VERSION);

  mainWindow.statusbar = new QStatusBar();
  mainWindow.statusbar.setSizeGripEnabled(false);
  mainWindow.win.setStatusBar(mainWindow.statusbar);
  updateStatus(false);

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

export function updateStatus(connected: boolean) {
  mainWindow.statusbar?.showMessage("Status: " + (connected ? 'Connected' : 'Disconnected'));
}

function createRoot() {
  const centralWidget = new QWidget();
  centralWidget.setObjectName("approot");
  mainWindow.rootLayout = new QBoxLayout(Direction.TopToBottom);
  centralWidget.setLayout(mainWindow.rootLayout);
  mainWindow.win?.setCentralWidget(centralWidget);
}

function createFPSSettingsLine(layout: QGridLayout, label: string, row: number, autoFPS: number, widgetGroup: FPSWidgetGroup) {
  const labelWidget = new QLabel();
  labelWidget.setText(label + ":");
  labelWidget.setAlignment(AlignmentFlag.AlignRight);
  labelWidget.setInlineStyle("color: black;")
  layout.addWidget(labelWidget, row, 0);

  const inputWidget = new QLineEdit();
  inputWidget.setInlineStyle("width: 35px; background-color: #fff; color: #000;");
  // inputWidget.setFocusPolicy(FocusPolicy.NoFocus);
  inputWidget.setText("100");
  layout.addWidget(inputWidget, row, 1);
  widgetGroup.input = inputWidget;

  const sliderWidget = new QSlider();
  sliderWidget.setOrientation(Orientation.Horizontal);
  sliderWidget.setTracking(true);
  sliderWidget.setRange(0, 200);
  sliderWidget.setTickPosition(TickPosition.TicksBelow);
  layout.addWidget(sliderWidget, row, 2);
  widgetGroup.slider = sliderWidget;

  // const checkboxWidget = new QCheckBox();
  // checkboxWidget.setObjectName("checkFieldFPSAuto");
  // checkboxWidget.setText(`Auto ${autoFPS} FPS`);
  // checkboxWidget.setInlineStyle("color: black;")
  // layout.addWidget(checkboxWidget, row, 3);
  // widgetGroup.auto = checkboxWidget;
}

function createFPSSettingsGroup() {
  const groupBox = new QGroupBox();
  const groupBoxLayout = new QGridLayout();
  groupBox.setObjectName("fpsgroup");
  groupBox.setLayout(groupBoxLayout);
  groupBox.setTitle("FPS Settings");
  mainWindow.rootLayout?.addWidget(groupBox);
  groupBoxLayout.setColumnStretch(2, 1);
  groupBoxLayout.setColumnMinimumWidth(2, 200);

  createFPSSettingsLine(groupBoxLayout, "Field", 0, 30, mainWindow.fps.field);
  // createFPSSettingsLine(groupBoxLayout, "World", 1, 30, mainWindow.fps.world);
  // createFPSSettingsLine(groupBoxLayout, "Battle", 2, 15, mainWindow.fps.battle);
}

function createGameTweaksGroup() {
  const groupBox = new QGroupBox();
  const groupBoxLayout = new QBoxLayout(Direction.TopToBottom);
  groupBox.setObjectName("tweaksgroup");
  groupBox.setLayout(groupBoxLayout);
  groupBox.setTitle("Game Tweaks");
  mainWindow.rootLayout?.addWidget(groupBox);

  const checkBattleSwirlFPS = new QCheckBox();
  checkBattleSwirlFPS.setObjectName("checkBattleSwirlFPS");
  checkBattleSwirlFPS.setText("Cap battle swirl to 60 FPS");
  checkBattleSwirlFPS.setInlineStyle("color: black;")
  groupBoxLayout.addWidget(checkBattleSwirlFPS);
  mainWindow.tweaks.battleSwirlCheck = checkBattleSwirlFPS;

  const checkMenuFPS = new QCheckBox();
  checkMenuFPS.setObjectName("checkMenuFPS");
  checkMenuFPS.setText("Cap menus to 60 FPS");
  checkMenuFPS.setInlineStyle("color: black;")
  groupBoxLayout.addWidget(checkMenuFPS);
  mainWindow.tweaks.menusCheck = checkMenuFPS;

  const checkDisablePausing = new QCheckBox();
  checkDisablePausing.setObjectName("checkDisablePausing");
  checkDisablePausing.setText("Don't pause the game when unfocused");
  checkDisablePausing.setInlineStyle("color: black;")
  groupBoxLayout.addWidget(checkDisablePausing);
  mainWindow.tweaks.pauseCheck = checkDisablePausing;
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
  inputSetSeed.setInlineStyle("width: 35px; background-color: #fff; color: #000;");
  groupBoxLayout.addWidget(inputSetSeed);  
  mainWindow.rng.setSeedInput = inputSetSeed;
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

export function createMainWindow() {
  createWindow();
  createRoot();
  createFPSSettingsGroup();
  // createGameTweaksGroup();
  createInjectSeedGroup();
  createButtons();

  mainWindow.win?.show();
  return mainWindow;
}