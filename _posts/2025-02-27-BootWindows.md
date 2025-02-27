---
layout: post
title: 使用QEMU9.2.0启动Windows实例
date: 2025-02-27
---

参照教程: 
`https://bbs.archlinux.org/viewtopic.php?id=277584`

从这里拿一个virtio-win.iso的驱动。
`https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.266-1/`

从这个网址拿一个Windows server的ISO镜像。
`https://www.microsoft.com/zh-cn/evalcenter/download-windows-server-2022`

我用的是Windows Server 2022 64bit En-US
```shell
wget https://software-static.download.prss.microsoft.com/sg/download/888969d5-f34g-4e03-ac9d-1f9786c66749/SERVER_EVAL_x64FRE_en-us.iso
```

用qemu-img弄一块空qcow2盘出来
```shell
qemu-img create -f qcow2 WindowsVM.img 64G
```

安装系统到qcow2中
```shell
/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64 \
-drive file=WindowsVM.img,format=qcow2,if=virtio \
-drive file=SERVER_EVAL_x64FRE_en-us.iso,media=cdrom \
-drive file=virtio-win.iso,media=cdrom \
-boot order=d \
-enable-kvm \
-cpu host \
-m 6G \
-smp 4 \
-vnc unix:/data/home/testuser/.cohpc/vms/winuser/vnc.sock
```

按照原来教程
```
6. Continue with the installation procedure
7. Click "Custom: Install windows only"
8. Click Browse > CD Drive with the virtio-win drivers > amd64 > wXX (for windows 10 it would be w10 etc) and OK then Next
9. Continue
10. After the installation shut off the VM, and to run from the disk just remove the virtio drivers and the ISO from the command. Also if the network already is not working you can add
```

我的操作是
选择"Custom: Install windows only"。
然后在virtio-win驱动中选了w11。
然后Windows就可以检测到那个64G的qcow2盘，向这里面安装就行。
然后关掉实例，去掉virtio-win.iso驱动和Windows ISO盘，只用qcow2启动。

```shell
/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64 \
-smp 4 \
-m 6G \
-cpu host \
-drive if=virtio,format=qcow2,file=/data/home/testuser/WindowsVM.img \
-enable-kvm \
-vnc unix:/data/home/testuser/.cohpc/vms/winuser/vnc.sock \
-net nic -net user,hostname=windows
```
然后就可以顺利启动了，使用用户态user网络。
我去掉了edk2-ovmf驱动
```
-drive if=pflash,format=raw,file=/usr/share/edk2/ovmf/OVMF_CODE.fd,readonly=on
```
