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

# 带UEFI的

创建一个目录叫做WindowsUEFIVM，在里面同样的qemu-img创建一块qcow2盘。
然后注意，把OVMF_VARS.fd复制一份进去，要用新的！（因为OVMF_VARS.fd是可写的，所以最好给它单独准备一份）

一般基本的启动命令如下，包括一块cdrom盘作为安装源，一块virtio-win驱动可以挂载进去。
```shell
/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64 \
-drive file=./WindowsUEFIVM/WindowsUEFIVM.img,format=qcow2,if=virtio \
-drive file=SERVER_EVAL_x64FRE_en-us.iso,media=cdrom \
-drive file=virtio-win.iso,media=cdrom \
-boot order=d \
-enable-kvm \
-cpu host \
-m 6G \
-smp 4 \
-vnc unix:/data/home/testuser/.cohpc/vms/winuser/vnc.sock \
-drive if=pflash,format=raw,file=/usr/share/edk2/ovmf/OVMF_CODE.fd,readonly=on \
-drive if=pflash,format=raw,file=./WindowsUEFIVM/OVMF_VARS.fd
```

参照该处教程：
https://github.com/virtio-win/kvm-guest-drivers-windows/wiki/Virtiofs:-Shared-file-system


注意在启动命令添加下列选项。注意memory-backend-memfd和随后的numa配置都是必要的（参见virtiofs）。
只有实际提供了virtio设备，在windows中才能识别出来，并且安装driver。
```
-chardev socket,id=char0,path=/tmp/vhost-fs-1.sock \
-device vhost-user-fs-pci,queue-size=1024,chardev=char0,tag=my_virtiofs1 \
-chardev socket,id=char1,path=/tmp/vhost-fs-2.sock \
-device vhost-user-fs-pci,queue-size=1024,chardev=char1,tag=my_virtiofs2 \
-object memory-backend-memfd,id=mem,size=6G,share=on \
-numa node,memdev=mem \
```

# 安装WinFsp 和 Virtiofs

在登录到Windows实例后，在`https://winfsp.dev`下载WinFsp驱动。
下载后安装，一直点Next即可。
从virtio-win.iso盘里面使用安装器安装Virtio驱动。
也是一直点Next即可。

在Device Manager中，找到Mass Storage Controller然后Update Drive。

然后注意，如果要使能多virtiofs实例，那么virtiofs的 **服务** 是不可以被启动的。
注意在service里面关掉它。并且禁止开机自启。

然后配置WinFsp来启动多Virtiofs实例。
```shell
"C:\Program Files (x86)\WinFsp\bin\fsreg.bat" virtiofs "<path to the binary>\virtiofs.exe" "-t %1 -m %2"
```


```shell
/data/software/modules/qemu/9.2.0/bin/qemu-system-x86_64 \
-smp 4 \
-m 6G \
-cpu host \
-drive if=virtio,format=qcow2,file=/data/home/testuser/WindowsUEFIVM/WindowsUEFIVM.img \
-enable-kvm \
-vnc unix:/data/home/testuser/.cohpc/vms/winuser/vnc.sock \
-net nic -net user,hostname=windows \
-drive if=pflash,format=raw,file=/usr/share/edk2/ovmf/OVMF_CODE.fd,readonly=on \
-drive if=pflash,format=raw,file=./WindowsUEFIVM/OVMF_VARS.fd
```

以及virtiofs参数。

cloudbase-init如果在SetUserPasswordPlugin之前用了CreateUserPlugin，那么`BaseCreateUserPlugin._get_password`就会返回一个随机的密码值。
如果使用HttpService配置的话那还好，能把这个密码POST回来。
但是在我们使用ConfigDriveService的场景，这个密码就不知道了。
还好，我们不需要创建其他user，所以简单的删除掉CreateUserPlugin就可以。

感觉这是一个cloudbase-init的bug。
https://github.com/cloudbase/cloudbase-init/issues/165

注意，使用Virtiofs，需要配置自动挂载磁盘。在UserData中，例如cloud-config中，配置runcmd一项即可。
注意SetUserPasswordPlugin一定要在UserDataPlugin之后！
这些都是cloudbase-init目前的bug。
