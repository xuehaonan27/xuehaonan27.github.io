---
layout: post
title: Slurm集群向Module包管理添加包
date: 2025-02-05
---

需要在Module管理的环境中添加包。

# Module环境

/data/software/src 用来放置源代码包
/data/software/modules/ 用来放置编译好的包
/data/software/module/tools/modules/modulefiles/ 用来放置包的Modulefile

# CMake
直接从Git仓库中拉取某一个tag的仓库，也可以wget下载.tar.gz等等包，都行。
```shell
git clone git@github.com:Kitware/CMake.git --tag v3.31.5
cd v3.31.5/
mkdir /data/software/modules
./bootstrap --prefix=/data/software/modules/cmake/3.31.5
make -j $(nproc)
make install
```

Modulefile(`/data/software/module/tools/modules/modulefiles/cmake/3.25.0`)
```tcl
#%Module1.0
set version 3.31.5
set prefix /data/software/modules/cmake/$version

prepend-path PATH $prefix/bin
prepend-path MANPATH $prefix/share/man
prepend-path LD_LIBRARY_PATH $prefix/lib
```

PATH指定二进制包的路径
MANPATH指定Manual的路径
LD_LIBRARY_PATH指定链接器搜寻库的路径

# VDE-2
从sourceforge拉取的会编译报错，所以还是直接从Github拉取源码吧。
```shell
git clone git@github.com:virtualsquare/vde-2.git
cd vde-2/
mkdir build
cd build/
cmake .. --install-prefix=/data/software/modules/vde/2.3.3
make -j$(nproc)
make install
```

/data/software/module/tools/modules/modulefiles/vde/2.3.3
```tcl
#%Module1.0
set version 2.3.3
set prefix /data/software/modules/vde/$version

prepend-path PATH $prefix/bin
prepend-path LD_LIBRARY_PATH $prefix/lib
prepend-path MANPATH $prefix/share/man
```

# QEMU
从QEMU官方下载源拉取包。
```shell
wget https://download.qemu.org/qemu-9.2.0.tar.xz
tar -xvf qemu-9.2.0.tar.xz
cd qemu-9.2.0
```

需要添加tomli和ninja等等依赖。
```shell
dnf install python3-tomli
dnf install ninja
```

QEMU的编译命令如下
```shell
PKG_CONFIG_PATH=/data/software/modules/vde/2.3.3/lib64/pkgconfig:$PKG_CONFIG_PATH \
./configure \
--enable-kvm \
--enable-slirp \
--enable-vde \
--enable-system \
--enable-user \
--extra-cflags="-I/data/software/modules/vde/2.3.3/include/" \
--extra-ldflags="-L/data/software/modules/vde/2.3.3/lib64/" \
--prefix=/data/software/modules/qemu/9.2.0
```
由于需要开启VDE和User网络设备支持，添加`--enable-slirp`和`--enable-vde`两个选项。
在CentOS/RHEL上需要看看PKG_CONFIG_PATH。
`--extra-cflags`是给C编译器看的，由于搜寻头文件，在单元编译过程中不需要看-L和-l选项，它们是给链接器看的，所以应该放到`--extra-ldflags`里面。


```shell
make -j$(nproc)
make install
```