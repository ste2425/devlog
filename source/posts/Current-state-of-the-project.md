---
title: Current state of the project
date: 2026-09-01 13:18:58
categories:
  - Projects
  - PSP-Bluetooth
---

For some time I've been working on my PSP-Bluetooth project, the successor to the PSP Bluetooth Consolizer project (I need to work on better names).

My original project aim was to replace the UMD Drive with a board that could inject controller inputs from Bluetooth controllers. Sadly it never got quite that far. It made a great consolizer, but was never portable. The main issue was the console would always think its buttons were pressed when the mod board didn't have power.

Instead I changed tact, keeping the Bluetooth hardware outside the PSP and instead began a project to design a dock. Combined with a plugin this should provide the Bluetooth functionality whilst having zero hardware changes to the console.

<video controls preload="metadata" width="700">

<source src="/videos/psp-dual-analog-working.mov" type="video/mp4">

Your browser does not support the video tag.

</video>

<!-- more -->

As you can see, we have something that works, quite well. We have the ability to use a Bluetooth controller, including dual analog, real dual analog. Not just mapped to other buttons (if the game supports it) as well as a few other cool features.

* Up to four controllers connected at once

* Individually accessible controllers if games support it (multiplayer)

* Auto power on from sleep when a controller is connected

* Rumble/Gyro/LED control if a game supports it

I've also built a second plugin (no point taking up the resources if it's not wanted) which indicates the connected controller battery level. It will request it when you press the `Home` button and display it on that screen

![Battery menu](/images/home-menu-battery.jpg)

## CI Builds

Alongside this we have the CI to build it all. I didn't like my first experiences with homebrew where you would see the source but no compiled binaries. You would try to compile it only to find it's using an old version of the SDK and, whilst learning, couldn't get it to work and gave up.

Now I have a GitHub action that will compile both plugins and upload a release, so there will always be compiled `PRX's` that just work.

## ESP32 Firmware

Plugins on the PSP side to inject controller data are just one half, we still need something to talk to the controllers and give that data to the PSP. This is the ESP32 firmware.

It works by exposing a serial interface. A command comes in from the PSP, the ESP deals with that command then responds with data.

The PSP is always in charge, the ESP only ever responds to a command and reports back. In theory this could be replaced by any device so long as it implements the serial interface.

More information can be found on the firmware's Github link below.

## Hardware

The final puzzle piece is how to connect the ESP to the PSP. Before now the only way has been to chop up an original headphones cable to use the connector.

I hated this because it destroyed original equipment but also wasn't very approachable or easy to build a dock around.

Instead I spent a long time designing a replacement connector. Replicating the connector itself was quite easy, the hard part was the headphones jack. The connector and jack form a complete unit and must both be implemented together.




![AV Connector](/images/av-connector.jpg)

In the end I came up with a solution that stacks up PCBs to get the correct position between the jack and the connector.

I also created a simple development board to connect the PSP to an ESP32 development board to make building this project easier. Again more can be found on its Github below.

## Conclusion.

All in all we're in a good place, things are working. There is still more testing to be done, I need to test with `POPS` and generally tidy things up and flesh out some of the features.

I'll be posting more regular project updates but they will be small, what I got done since the last update, kind of posts.

## Links

* PSP Plugins: [https://github.com/ste2425/PSP-Bluetooth-Plugin](https://github.com/ste2425/PSP-Bluetooth-Plugin)

* ESP32 Firmware: [https://github.com/ste2425/PSP-Bluetooth-Firmware](https://github.com/ste2425/PSP-Bluetooth-Firmware)

* Dev board Hardware: [https://github.com/ste2425/PSP-Bluetooth-AVConnector](https://github.com/ste2425/PSP-Bluetooth-AVConnector)