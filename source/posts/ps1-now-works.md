---
title: PS1 (POPS) now works
date: 2026-09-08 20:35:00
categories:
  - Projects
  - PSP-Bluetooth
---

# References
Below is based on work from a number of projects. Most of what i say i have not worked out myself but learnt from these projects.

* [https://github.com/crozone/PSP-EmulatedControllerTest](https://github.com/crozone/PSP-EmulatedControllerTest)
  * Demonstrates how to register a controller handler for the external controller port.
* [https://github.com/Operation-DITTO/ctrlHook](https://github.com/Operation-DITTO/ctrlHook)
  * Demonstrates how to hook various `sceCtrlReadBufferX` methods.
* [https://github.com/pebeto/missyhud.prx](https://github.com/pebeto/missyhud.prx)
  * Also demonstrates hooking various methods, has a nicer application architecture i will emulate.
* [https://psp-re.github.io/blog/nid-cracking/](https://psp-re.github.io/blog/nid-cracking/)
  * Great resources for NID's and understanding what they are.

---

So i found out recently that my plugin does not work on POPS, the PS1 emulator. After a bit of debugging we found that my plugin is running and requesting controller data from the ESP. This means it must be the controller hooking having issues.

# Emulating DS3 data.

Bluetooth controller input is currently hooked by registering a external controller port same way the GO does. This is great as it allows software built for the DS3 to work. 

The first job is to create the handler for the external controller port. This means the PSP will poll our handler as part of its internal controller polling loop.

```c
  static
  s32 ctrl_input_data_handler_func(void *pSrc, SceCtrlData2 *pDst)
  {
      SceUInt* p_new_buttons = (SceUInt*)pSrc;
      SceUInt new_buttons = p_new_buttons != NULL ? *p_new_buttons : 0;

      // load state from ESP32 and apply to controller pad data.

      // button state 
      pDst->buttons = new_buttons;

      pDst->DPadSenseA = 0;
      pDst->DPadSenseB = 0;
      pDst->GPadSenseA = 0;
      pDst->GPadSenseB = 0;
      // gyro related data
      pDst->AxisSenseA = 0;
      pDst->AxisSenseB = 0;
      pDst->TiltA = 0;
      pDst->TiltB = 0;
      // left analog data
      pDst->aX = 125;
      pDst->aY = 125;
      // right analog data
      pDst->rX = 125;
      pDst->rY = 125;

      // Success
      return 0;
  }

  SceCtrlInputDataTransferHandler controller_data_transfer_handler = {
    .unk1 = sizeof(SceCtrlInputDataTransferHandler),
    .copyInputData = ctrl_input_data_handler_func
  };

  static SceUInt g_button_state = 0;
  ctrl_input_handler_id = sceCtrl_driver_E467BEC8(SCE_CTRL_PORT_DS3, &controller_data_transfer_handler, &g_button_state);
```

With that done there is one missing piece. On a non PSP GO console nothing is reading this data. The usual `sceCtrlPeekBufferNegative` or `sceCtrlReadBufferPositive` calls don't use it.

Luckily there is a way to tell the PSP to pass through controller state from a specific controller port buffer into the global buffer.

```c
  sceCtrl_driver_6C86AF22(SCE_CTRL_PORT_DS3);
```

Now we have a emulated external controller that works in the VSH as well as PSP games. 

Unfortunately not on the PS1 emulator.

`Cat` and `Crozone` from the PSP Homebrew Discord verified that `POPS.prx` is calling `sceCtrlPeekBufferNegative` internally. 

I do not know if calling `sceCtrl_driver_6C86AF22` should mean `sceCtrlPeekBufferNegative` can see the controller port data, or if the reason it not working is a `POPS` specific thing. I may throw a quick test to gether to read using `sceCtrlPeekBufferNegative` to test.

PSP GO has its own unique version of `POPS` so it maybe if that version was used it would work.

# Hooking `sceCtrlPeekBufferNegative`

So the Solution for PS1 games is not to register an external controller port, but to hook `sceCtrlPeekBufferNegative`.

That means to monkey patch it, to hijack it and call our own instead.

That way when `POPS` calls `sceCtrlPeekBufferNegative` it instead calls our own version. We can then go get our bluetooth controller data, call the real `sceCtrlPeekBufferNegative` and merge the two. Returning to `POPS` the result.

In order to hook a method we need to know its `NID` or `Name Identifier`. This is used in Sony's PRX executable format for function imports and exports (taken directly from the `NID Cracking` link above).

Once you know the `NID` you can get a reference to the original function. This allows you to patch it, but then also execute the original later.

```c
  int (*hooked_peekbuffer_func_neg)(SceCtrlData *data, u8 nBufs);

  hooked_peekbuffer_func_neg = (void *)sctrlHENFindFunction(
    "sceController_Service", //Module name
    "sceCtrl", // Library name
    0XC152080A //NID
  );
```

Once we have the original function it can be hooked so any calls to it call our patch instead.

```c
  sctrlHENPatchSyscall(hooked_peekbuffer_func_neg, sceCtrlPeekBufferNegative_patch);
```

Inside of the patch we can then call the original to get the PSP's controller state, then do our manipulations to it.

```c
  s32 sceCtrlPeekBufferNegative_patch(SceCtrlData *data, u8 nBufs)
  {  
    int resp =  hooked_peekbuffer_func_neg(data, nBufs);

    // do what we want to `data`
    // for example if triangle is pressed also press DPAD left
    if (!(data->Buttons & PSP_CTRL_TRIANGLE)) {

      // Force LEFT pressed by clearing its bit.
      data->Buttons &= ~PSP_CTRL_LEFT;
    }

    return resp;
  }
```

Key here is to ensure we return the response from calling the original `sceCtrlPeekBufferNegative` otherwise `POPS` seems to ignore it.

# Conclusion

And thats it, it now works. This does mean im going to need to build a POPS only plugin that does the patching and another that emulates the external controller for normal use. 

Please check out the links at the start to see where i got all this information from and for complete code examples.

