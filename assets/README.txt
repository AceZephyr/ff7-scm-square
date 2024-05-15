SpeedSquare - FF7 speedrunner's app
(c) 2024 mav (twitch.tv/m4v3k)

Final Fantasy VII PC is notoriously difficult to speedrun competitively and not because 
it's a hard speed game, but because of it's unreliable FPS while running. The game 
*should* be running at 30 FPS (with battles running at 15 and menus running at 60) but 
the FPS is inconsistent on different computers, giving some people a disadvantage when 
running the game. This tool aims to fix this and other issues to give the runners 
a level playing field.

-------------------------
FPS Fix
-------------------------

SpeedSquare incorporates a totally rewritten graphics driver courtesy of the FFNx team, 
which makes the game frame rate much more stable, targeting exactly 30 FPS on fields all 
the times. There are slight dips on some fields (especially fields that play FMVs) but 
these dips should be consistent for everyone. 

No configuration is necessary. Just run the app and click "Install", select your game 
directory and you're  done. If you ever want to remove the FPS Fix just click on the 
"Uninstall" button.

Because with this fix the frame rate is stable for everyone this also removes the need 
for DxTory or other FPS display tools.

-------------------------
SCM RNG injection
-------------------------

The PC version of Final Fantasy VII is programmed in a way that makes it possible to 
influence the battle RNG by changing one's system clock and then running the game at an 
exact time to make sure you'll get always the same outcome in battles. Changing your 
system clock however is something that can wreak havoc on your computer - the operating 
system doesn't like that much, streaming software sometimes freaks out and there are 
other issues.

With SpeedSquare you can instead inject the RNG seed directly into the game without 
touching your system clock. This has the exact same result as doing it via system clock 
change without the negative side effects. To convert a given time to a seed number you 
can use sites like unixtimestamp.com. For example a seed for 6:53, 5/12/2024 (UTC) is 
1715525580. Note that sometimes to get the correct seed you have to add a second or two 
to the value you want.

To enable RNG injection tick the "Inject Battle RNG Seed" checkbox. Then you have 
two choices:

* Random seed - this option makes sure that you'll get a random seed every time you run 
                the game without it being dependent on your system clock.
* Set seed    - with this option enabled a seed from the text box to the right will be 
                injected to the game every time it starts.

-------------------------
Loading/saving defaults
-------------------------

At the bottom of the app interface there are two buttons:

* Save as default - saves the current configuration (RNG Injection status, type & seed) 
                    for later use. This configuration will be loaded everytime SpeedSquare
                    app starts.
* Revert to saved - reverts the configuration to the previously saved default values

-------------------------
Changing default renderer
-------------------------

By default the graphics driver is configured to automatically pick the best renderer
backend for you, but is some rare cases it might not pick the best one. If you encounter
graphical issues or frame rate drops try changing the default setting to something else
by editing the FFNx.toml file and replacing the value of "renderer_backend" from 0
to one of the available options as described in the file.
