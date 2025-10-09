# Boot Windows on QEMU 9.2.0
I tries to boot Windows on QEMU 9.2.0. This is how the process goes.

## References
- [This](https://bbs.archlinux.org/viewtopic.php?id=277584) is the post that I take for reference.
- Get a `virtio-win.iso` driver from [here](https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.266-1/).
- Get a Windows server ISO from [here](https://www.microsoft.com/zh-cn/evalcenter/download-windows-server-2022).
- VirtioFS [reference](https://github.com/virtio-win/kvm-guest-drivers-windows/wiki/Virtiofs:-Shared-file-system) from virtio-win.

## Run the QEMU
I am doing this work on a HPC cluster with x86-64 architecture and a Linux operating system distribution.

I personally use `Windows Server 2022 64bit En-US`. Get with wget:
```shell
wget https://software-static.download.prss.microsoft.com/sg/download/888969d5-f34g-4e03-ac9d-1f9786c66749/SERVER_EVAL_x64FRE_en-us.iso
```

Get an empty and big enough disk in `qcow2` format with `qemu-img`, here I name it as `WindowsVM.img` and give it 64G.
```shell
qemu-img create -f qcow2 WindowsVM.img 64G
```

Get UEFI bootloader.

Install the Windows operating system into the qcow2 disk.
```shell
# Replace this with your QEMU binary path
QEMU_BIN=/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64
# The VNC socket will be placed here
SOCK_PLACE=/data/home/testuser/.cohpc/vms/winuser/vnc.sock
# Path to the qcow2 disk
WIN_IMG=WindowsVM.img
# Path to the Windows ISO
WIN_ISO_PATH=SERVER_EVAL_x64FRE_en-us.iso
# Path to the virtio-win driver
VIRTIO_WIN_DRIVER=virtio-win.iso

# Path to UEFI bootloader OVMF code (read-only)
OVMF_CODE_PATH=/usr/share/edk2/ovmf/OVMF_CODE.fd
# Path to UEFI bootloader OVMF variables (read-write)
OVMF_VARS_PATH=./WindowsUEFIVM/OVMF_VARS.fd

${QEMU_BIN} \
    -drive file=${WIN_IMG},format=qcow2,if=virtio \
    -drive file=${WIN_ISO_PATH},media=cdrom \
    -drive file=${VIRTIO_WIN_DRIVER},media=cdrom \
    -boot order=d \
    -enable-kvm \
    -cpu host \
    -m 6G \
    -smp 4 \
    -vnc unix:${SOCK_PLACE} \
    -drive if=pflash,format=raw,file=${OVMF_CODE_PATH},readonly=on \
    -drive if=pflash,format=raw,file=${OVMF_VARS_PATH}
```
Script explained:
1. Because I run these scripts on a HPC cluster which adopts `modules` as package manager, so binary pathes might be strange.
2. I exposes a VNC socket to enable graphic user interface or it would be too difficult to manipulating with Windows.
3. I am on x86-64 Linux so `-enable-kvm` should be enabled or the VM would be too slow.
4. We are booting from ISO so `-boot order=d` is required.
5. It's better copy a separate OVMF_VARS.fd for a new VM instance because it's read-write.

## Setup Windows
As said in [this](https://bbs.archlinux.org/viewtopic.php?id=277584) post mentioned above:
```plaintext
...
6. Continue with the installation procedure
7. Click "Custom: Install windows only"
8. Click Browse > CD Drive with the virtio-win drivers > amd64 > wXX (for windows 10 it would be w10 etc) and OK then Next
9. Continue
10. After the installation shut off the VM, and to run from the disk just remove the virtio drivers and the ISO from the command. Also if the network already is not working you can add
```

But since I am using Windows 11, so this is what I do:
1. Click "Custom: Install windows only"
2. Select `w11` in `virtio-win` driver.
3. Then Windows could detect that 64G qcow2 disk, select it and install into it.
4. Close the QEMU instance.
5. Remove `virtio-win.iso` drive and Windows ISO from the QEMU launch command and boot with qcow2 disk only.

This is the script:
```shell
# Replace this with your QEMU binary path.
QEMU_BIN=/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64
# The VNC socket will be placed here.
SOCK_PLACE=/data/home/testuser/.cohpc/vms/winuser/vnc.sock
# Path to the qcow2 disk
WIN_IMG=WindowsVM.img

# Path to UEFI bootloader OVMF code (read-only)
OVMF_CODE_PATH=/usr/share/edk2/ovmf/OVMF_CODE.fd
# Path to UEFI bootloader OVMF variables (read-write)
OVMF_VARS_PATH=./WindowsUEFIVM/OVMF_VARS.fd


${QEMU_BIN} \
    -smp 4 \
    -m 6G \
    -cpu host \
    -drive if=virtio,format=qcow2,file=${WIN_IMG} \
    -enable-kvm \
    -vnc ${SOCK_PLACE} \
    -net nic \
    -net user,hostname=windows \
    -drive if=pflash,format=raw,file=${OVMF_CODE_PATH},readonly=on \
    -drive if=pflash,format=raw,file=${OVMF_VARS_PATH}
```

Script explained:
1. `-net user,hostname=windows` enables user network device, meaning we are using host network. Normal build of QEMU or QEMU installed by distribution package manager might not have user network enabled. Refer to [this chapter](./build_modules_on_hpc_cluster.md) for how to build a QEMU that fulfills requirement.

Now the Windows VM is launched, and could have access to host network. In my case, that means it could reach to the campus subnet and even Internet after log into the gateway.

## Virtiofs: shared file system
To enable shared file system for mounting host files into the Windows VM, we should install virtiofs.

Reference could be found [here](https://github.com/virtio-win/kvm-guest-drivers-windows/wiki/Virtiofs:-Shared-file-system).

To enable `VirtioFS`, we must add following lines into QEMU startup command and **no line** could be omitted. **And virtio-win driver should also be added back**.

```shell
...
    -chardev socket,id=char0,path=/tmp/vhost-fs-1.sock \
    -device vhost-user-fs-pci,queue-size=1024,chardev=char0,tag=my_virtiofs1 \
    -chardev socket,id=char1,path=/tmp/vhost-fs-2.sock \
    -device vhost-user-fs-pci,queue-size=1024,chardev=char1,tag=my_virtiofs2 \
    -object memory-backend-memfd,id=mem,size=6G,share=on \
    -numa node,memdev=mem \
```

## Install WinFsp and VirtioFS
After logged into Windows VM, we could download WinFsp driver from this website: `https://winfsp.dev` (Remember that the VM could reach to host network now).

Personally I use this:
```
https://github.com/winfsp/winfsp/releases/download/v2.1B2/winfsp-2.1.24255.msi
```

After downloaded, run the installer and click `next` on and on.
Then install virtio drivers from `virtio-win.iso` disk mounted into the Windows VM. Click `next` on and on.

In Windows `Device Manager`, found `Mass Storage Controller` tab and `Update Drive`.

Mention that `virtiofs` could only have one instance by default, if we want to have multiple instances, `virtiofs` service must not be enabled and running, so stop and disable it in Windows Service.
And then we must setup `WinFsp` to replace `virtiofs`. In PowerShell:
```shell
"C:\Program Files (x86)\WinFsp\bin\fsreg.bat" virtiofs "<path to the binary>\virtiofs.exe" "-t %1 -m %2"
```

## Install Windows on Aarch64 architecture
Reference could be found [here](https://linaro.atlassian.net/wiki/spaces/WOAR/pages/28914909194/windows-arm64+VM+using+qemu-system).

Install from ISO into qcow2.
```shell
sudo qemu-system-aarch64 \
    -device qemu-xhci -device usb-kbd -device usb-tablet \
    -device usb-storage,drive=install \
    -drive file=./Win11_24H2_English_Arm64.iso,media=cdrom,if=none,id=install \
    -device usb-storage,drive=virtio-drivers \
    -drive file=./virtio-win.iso.1,media=cdrom,if=none,id=virtio-drivers \
    -drive file=./WindowsVMAarch64.qcow2,format=qcow2,if=virtio \
    -device ramfb \
    -boot order=d \
    --accel kvm \
    -machine virt \
    -cpu host \
    -m 8G \
    -smp 8 \
    -vnc 0.0.0.0:1 \
    -bios /usr/share/qemu-efi-aarch64/QEMU_EFI.fd \
    -nic user,model=virtio-net-pci
```

And rerun QEMU, but boot from qcow2 this time.
