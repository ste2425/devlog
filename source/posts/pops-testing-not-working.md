---
title: POPS Testing - Not working
date: 2026-09-02 21:47:00
categories:
  - Projects
  - PSP-Bluetooth
---

Today attempted to load a game via POPS, Spyro 2. Brilliant game.

Sadly neither plugins worked, not the controller patching nor the battery level indicator.

I was somewhat hoping this would `Just Work`.

The way it's been built is i have two threads. The `PSP` is not multi-threaded. It's `concurrency`, not `parallelism`. 

One of these threads polls the `ESP32` for the latest controller states, whilst the second patches the `PSP` internal controller states.

The question is figuring where it is breaking, is the plugin not being loaded at all, are the treads not working, is one of them not working and the other is?

Luckily there is quite an easy way to resolve this. I could monitor the commands coming into the `ESP32`. If i see commands coming in then that proves at least the plugin is loaded and one of the threads is running.

On the `ESP` there are multiple Serial ports. I'm using `Serial` and `Serial2`. `Serial` is the primary one everyone uses when using an `Arduino` or `ESP32`. It's bound to the USB port. The others are bound to specific `GPIO` pins (they can be re-configured).

So we use `Serial2` to talk to the PSP bound to `RX: GPIO 16` and `TX: GPIO 18` at Baud `38400`. This leaves `Serial` free for me to send debug information to a connected computer.

I modified the command parsing logic to send out `0x17` when processing a command, if i see this then i know at least half of it is working.

```c
void processCommand(uint8_t command) {
    Serial.write(0x17);
    
    for (int i = 0; i < commandCount; ++i) {
        if (commands[i].code == command) {            
            commands[i].function();
            
            return;
        }
    }

    SerialWrapper_write(RESPONSE_COMMANDNOTFOUND);
}
```

Good news, we do.

<video controls preload="metadata" width="700">

  <source src="/videos/pops-prove-esp-polling-works.mp4" type="video/mp4">

  Your browser does not support the video tag.

</video>

So this proves the plugin is loaded and at least the ESP polling thread is working.

Nex job, investigate the controller patching.

