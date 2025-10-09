# A Bug Caused by MAC Address
When developing CoHPC, I use QEMU to launch virtual machine and setup VM with `cloud-init`.

Add NIC in QEMU boot command:
```Shell
${QEMU} \
    -netdev vde,id=net0,sock=./vdesock \
    -device e1000,netdev=net0,mac=${MAC_ADDRESS} \
    -netdev user,id=user0,hostfwd=tcp::64306-:22 \
    -device e1000,netdev=user0 \
    ...
```
I randomly generates MAC address into `${MAC_ADDRESS}`.
In `Network Config` section in `cloud-init`, I adopted the same MAC address as in the QEMU command, and allocated a static IP address.

But QEMU log indicates that NIC might not be configured correctly randomly. It turns out that MAC address generation is wrong.

![48-bit MAC address(from Wikipedia)](./assets/MAC-48_Address.png)

Since MAC address is randomly generated, so b0 bit in the first byte might be 1, meaning `multicast` and IP address could not be claimed by that NIC correctly. MAC should be `unicast`.

So the first 3 bytes of MAC address should not be randomly generated. Usually `52:00:00` is good. And the randomness could be left to latter 3 bytes.
