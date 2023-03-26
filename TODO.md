# TODO

# Battle seed injecting:

* figure out where best to inject the battle seed and in what format
* make sure it only works for new game, and not for loading game from a save
* displaying seed status on the start screen

# Speed Square app:

* √ Finish state management & update UI
  * √ Tweaks/RNG settings
* √ Mock memoryjs library
* √ Finish implementing memoryjs mock - writeMemory
* √ Finish tests for memoryjs mock - writeBuffer
* √ Remove game tweaks section
* √ Find the FF7 process in memory and auto-connect
* √ Handle connection status in UI via events
* --- Fetching memory values in a loop
* --- Memory patching code
* √ Applying all settings when changed and when game is restarted
* √ Initial Field FPS setting
* √ First in-game test
* √ Setup DxTory to check the field FPS
* √ Manual FPS setting:
  * √ Field module
  * - World module
  * √ Battle module
* √ Inserting set Battle RNG seed
  * seed is stored in rand() function, uses tls->randomState variable
* √ Inserting a random Battle RNG seed
* √ Make sure not to inject seed into the game if we're loading a save
* √ Displaying a message on the title screen with info
* √ Add the tweaks section again (battle swirl fix, disable auto-pause when unfocused)
  √ Make sure we have a mechanism to roll back the patches
* √ Change the slider range to be 0-1000
* BUG: Random seed changes when changing any of the UI controls