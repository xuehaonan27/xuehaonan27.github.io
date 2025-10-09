# Add packages to Module package manager
After installed `Module` package manager on HPC cluster, we should add packages.

## Module environment
- `/data/software/src`: for source code.
- `/data/software/modules/`: for built binaries and libraries.
- `/data/software/module/tools/modules/modulefiles/`: for packages' Modulefile.

## CMake
Pull from git repository or download via wget. Here I clone from git repository with version `3.31.5`.
```shell
git clone git@github.com:Kitware/CMake.git --tag v3.31.5
cd v3.31.5/
mkdir /data/software/modules
./bootstrap --prefix=/data/software/modules/cmake/3.31.5
make -j $(nproc)
make install
```

Module file should be placed here: `/data/software/module/tools/modules/modulefiles/cmake/3.25.0`.

Modulefile content:
```tcl
#%Module1.0
set version 3.31.5
set prefix /data/software/modules/cmake/$version

prepend-path PATH $prefix/bin
prepend-path MANPATH $prefix/share/man
prepend-path LD_LIBRARY_PATH $prefix/lib
```

Note:
- `PATH` should be the directory where the binaries exists (`$prefix/bin` in this example).
- `MANPATH` should be the directory where the manuals exists.
- `LD_LIBRARY_PATH` should be the directory where the libraries exists for the loader and linker.

## VDE-2
Pull source from `sourceforge` would not compile. I chose to clone source from Github.
```shell
git clone git@github.com:virtualsquare/vde-2.git
cd vde-2/
mkdir build
cd build/
cmake .. --install-prefix=/data/software/modules/vde/2.3.3
make -j$(nproc)
make install
```

Modulefile path: `/data/software/module/tools/modules/modulefiles/vde/2.3.3`.
Modulefile content:
```tcl
#%Module1.0
set version 2.3.3
set prefix /data/software/modules/vde/$version

prepend-path PATH $prefix/bin
prepend-path LD_LIBRARY_PATH $prefix/lib
prepend-path MANPATH $prefix/share/man
```

## QEMU
Pull source from QEMU official website.
```shell
wget https://download.qemu.org/qemu-9.2.0.tar.xz
tar -xvf qemu-9.2.0.tar.xz
cd qemu-9.2.0
```

Dependencies should be installed. Since my HPC cluster uses Rocky Linux, the package manager is `dnf`. But on other distributions, you should adopt different package managers and package name might be different as well.
```shell
dnf install python3-tomli
dnf install ninja
```

Compile QEMU with following command.
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

Command explained:
-  Note that I enabled some options in configuring phase because I need VDE and User network device support. 
- On CentOS/RHEL, `PKG_CONFIG_PATH` is required.
- `--extra-cflags` is for C compiler.
- `--extra-ldflags` is for linker.

Build and install.
```shell
make -j$(nproc)
make install
```
